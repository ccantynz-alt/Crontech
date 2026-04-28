import { authChallenges, credentials, users } from "@back-to-the-future/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, like, lt } from "drizzle-orm";
import { z } from "zod";
import { generateCsrfToken, validateCsrfToken } from "../../auth/csrf";
import { buildGoogleAuthUrl } from "../../auth/google-oauth";
import {
  calculatePasswordStrength,
  loginWithPassword,
  loginWithPasswordSchema,
  registerWithPassword,
  registerWithPasswordSchema,
} from "../../auth/password";
import { createSession, deleteSession } from "../../auth/session";
import {
  generateAuthenticationOpts,
  generateRegistrationOpts,
  verifyAuthentication,
  verifyRegistration,
} from "../../auth/webauthn";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "../../auth/webauthn";
import { autoProvisionUser } from "../../automation/auto-provision";
import { auditMiddleware } from "../../middleware/audit";
import type { TRPCContext } from "../context";
import { protectedProcedure, publicProcedure, router } from "../init";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Db = TRPCContext["db"];

/** Persist a challenge to the DB, pruning expired rows first. */
async function storeChallenge(db: Db, key: string, challenge: string): Promise<void> {
  // Prune expired challenges inline — avoids a separate setInterval
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, new Date()));
  await db
    .insert(authChallenges)
    .values({
      key,
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: authChallenges.key,
      set: {
        challenge,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
}

/** Fetch and atomically delete a challenge from the DB. Returns null if missing or expired. */
async function consumeChallenge(db: Db, key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.key, key), gt(authChallenges.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.delete(authChallenges).where(eq(authChallenges.key, key));
  return row.challenge;
}

/** Helper to validate CSRF token on auth mutations. */
function requireCsrfToken(csrfToken: string | null): void {
  if (!validateCsrfToken(csrfToken)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid or missing CSRF token.",
    });
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

const registrationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    attestationObject: z.string(),
    clientDataJSON: z.string(),
    transports: z.array(z.string()).optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
    authenticatorData: z.string().optional(),
  }),
  authenticatorAttachment: z.enum(["cross-platform", "platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  type: z.literal("public-key"),
});

const authenticationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  response: z.object({
    authenticatorData: z.string(),
    clientDataJSON: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
  authenticatorAttachment: z.enum(["cross-platform", "platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  type: z.literal("public-key"),
});

export const authRouter = router({
  // CSRF token endpoint: clients must fetch a token before auth mutations
  csrfToken: publicProcedure.query(() => {
    return { token: generateCsrfToken() };
  }),

  register: router({
    start: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          displayName: z.string().min(1).max(255),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        // Validate CSRF token on state-changing operation
        requireCsrfToken(ctx.csrfToken);
        const { email, displayName } = input;

        // Check if user already exists
        const existing = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);

        let user: { id: string; email: string; displayName: string };

        const existingUser = existing[0];
        if (existingUser) {
          user = {
            id: existingUser.id,
            email: existingUser.email,
            displayName: existingUser.displayName,
          };
        } else {
          const id = generateId();
          await ctx.db.insert(users).values({
            id,
            email,
            displayName,
          });
          user = { id, email, displayName };
        }

        // Get existing credentials for exclusion
        const existingCreds = await ctx.db
          .select({
            id: credentials.id,
            credentialId: credentials.credentialId,
            transports: credentials.transports,
          })
          .from(credentials)
          .where(eq(credentials.userId, user.id));

        const options = await generateRegistrationOpts(user, existingCreds);

        // Store challenge keyed by user ID
        await storeChallenge(ctx.db, `reg:${user.id}`, options.challenge);

        return {
          options,
          userId: user.id,
        };
      }),

    finish: publicProcedure
      .input(
        z.object({
          userId: z.string().uuid(),
          response: registrationResponseSchema,
        }),
      )
      .use(auditMiddleware("auth.register.passkey"))
      .mutation(async ({ input, ctx }) => {
        // CSRF validation on finish step
        requireCsrfToken(ctx.csrfToken);

        const { userId, response } = input;

        const expectedChallenge = await consumeChallenge(ctx.db, `reg:${userId}`);
        if (!expectedChallenge) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Registration challenge expired or not found. Please restart registration.",
          });
        }

        const verification = await verifyRegistration(
          response as unknown as RegistrationResponseJSON,
          expectedChallenge,
        );

        if (!verification.verified || !verification.registrationInfo) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Registration verification failed.",
          });
        }

        const { credential, credentialDeviceType, credentialBackedUp } =
          verification.registrationInfo;

        const transports = response.response.transports;

        // Store the credential
        const credentialRecord = {
          id: generateId(),
          userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
          deviceType: credentialDeviceType as "singleDevice" | "multiDevice",
          backedUp: credentialBackedUp,
          transports: transports ? JSON.stringify(transports) : null,
        };

        await ctx.db.insert(credentials).values(credentialRecord);

        // Create session
        const token = await createSession(userId, ctx.db);

        // Fire-and-forget auto-provisioning (non-blocking)
        const userRow = await ctx.db
          .select({ email: users.email, displayName: users.displayName })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const provisionUser = userRow[0];
        if (provisionUser) {
          autoProvisionUser({
            userId,
            email: provisionUser.email,
            displayName: provisionUser.displayName,
          }).catch(() => {
            // Provisioning failures are logged internally and queued for retry.
            // Never block the registration response.
          });
        }

        return {
          verified: true,
          token,
        };
      }),
  }),

  login: router({
    start: publicProcedure
      .input(
        z
          .object({
            email: z.string().email().optional(),
          })
          .optional(),
      )
      .mutation(async ({ input, ctx }) => {
        // Validate CSRF token on state-changing operation
        requireCsrfToken(ctx.csrfToken);

        const email = input?.email;
        let allowCredentials:
          | { id: string; credentialId: string; transports: string | null }[]
          | undefined;
        let userId: string | undefined;

        if (email) {
          const userResult = await ctx.db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          const foundUser = userResult[0];
          if (!foundUser) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "User not found.",
            });
          }

          userId = foundUser.id;

          allowCredentials = await ctx.db
            .select({
              id: credentials.id,
              credentialId: credentials.credentialId,
              transports: credentials.transports,
            })
            .from(credentials)
            .where(eq(credentials.userId, userId));

          if (allowCredentials.length === 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No passkeys registered for this user.",
            });
          }
        }

        const options = await generateAuthenticationOpts(allowCredentials);

        // Store challenge - use userId if known, otherwise use the challenge itself as key
        const challengeKey = userId ? `auth:${userId}` : `auth:discoverable:${options.challenge}`;
        await storeChallenge(ctx.db, challengeKey, options.challenge);

        return {
          options,
          userId: userId ?? null,
        };
      }),

    finish: publicProcedure
      .input(
        z.object({
          userId: z.string().uuid().nullable(),
          response: authenticationResponseSchema,
        }),
      )
      .use(auditMiddleware("auth.login.passkey"))
      .mutation(async ({ input, ctx }) => {
        // CSRF validation on finish step
        requireCsrfToken(ctx.csrfToken);

        const { response } = input;
        let { userId } = input;

        // Look up the credential by credentialId
        const credentialResult = await ctx.db
          .select()
          .from(credentials)
          .where(eq(credentials.credentialId, response.id))
          .limit(1);

        const storedCredential = credentialResult[0];
        if (!storedCredential) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credential not found.",
          });
        }

        // If userId was not provided (discoverable credential flow), use the credential's userId
        if (!userId) {
          userId = storedCredential.userId;
        }

        // Verify the userId matches the credential
        if (storedCredential.userId !== userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Credential does not belong to this user.",
          });
        }

        // Try to consume the challenge
        let expectedChallenge = await consumeChallenge(ctx.db, `auth:${userId}`);
        if (!expectedChallenge) {
          // Try discoverable key challenges — fetch the most recent valid one
          const discoverableRows = await ctx.db
            .select()
            .from(authChallenges)
            .where(
              and(
                like(authChallenges.key, "auth:discoverable:%"),
                gt(authChallenges.expiresAt, new Date()),
              ),
            )
            .orderBy(desc(authChallenges.createdAt))
            .limit(1);
          const discoverableRow = discoverableRows[0];
          if (discoverableRow) {
            await ctx.db.delete(authChallenges).where(eq(authChallenges.key, discoverableRow.key));
            expectedChallenge = discoverableRow.challenge;
          }
        }

        if (!expectedChallenge) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Authentication challenge expired or not found. Please restart login.",
          });
        }

        const verification = await verifyAuthentication(
          response as unknown as AuthenticationResponseJSON,
          {
            credentialId: storedCredential.credentialId,
            publicKey: new Uint8Array(storedCredential.publicKey),
            counter: storedCredential.counter,
            transports: storedCredential.transports,
          },
          expectedChallenge,
        );

        if (!verification.verified) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authentication verification failed.",
          });
        }

        // Update the credential counter
        await ctx.db
          .update(credentials)
          .set({
            counter: verification.authenticationInfo.newCounter,
          })
          .where(eq(credentials.id, storedCredential.id));

        // Create session
        const token = await createSession(userId, ctx.db);

        return {
          verified: true,
          token,
          userId,
        };
      }),
  }),

  logout: protectedProcedure.use(auditMiddleware("auth.logout")).mutation(async ({ ctx }) => {
    if (ctx.sessionToken) {
      await deleteSession(ctx.sessionToken, ctx.db);
    }
    return { success: true };
  }),

  // ── Password Authentication ──────────────────────────────────────
  registerWithPassword: publicProcedure
    .input(registerWithPasswordSchema)
    .use(auditMiddleware("auth.register.password"))
    .mutation(async ({ input, ctx }) => {
      requireCsrfToken(ctx.csrfToken);

      const result = await registerWithPassword(input, ctx.db);

      // Fire-and-forget auto-provisioning (non-blocking)
      autoProvisionUser({
        userId: result.userId,
        email: input.email,
        displayName: input.displayName,
      }).catch(() => {
        // Provisioning failures are logged internally and queued for retry.
        // Never block the registration response.
      });

      return {
        userId: result.userId,
        token: result.token,
      };
    }),

  loginWithPassword: publicProcedure
    .input(loginWithPasswordSchema)
    .use(auditMiddleware("auth.login.password"))
    .mutation(async ({ input, ctx }) => {
      requireCsrfToken(ctx.csrfToken);

      const result = await loginWithPassword(input, ctx.db);
      return {
        userId: result.userId,
        token: result.token,
      };
    }),

  // ── Google OAuth ──────────────────────────────────────────────────
  getGoogleAuthUrl: publicProcedure
    .input(
      z
        .object({
          redirectTo: z.string().optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const url = buildGoogleAuthUrl(input?.redirectTo);
      return { url };
    }),

  // ── Password Strength (utility) ──────────────────────────────────
  checkPasswordStrength: publicProcedure
    .input(z.object({ password: z.string() }))
    .query(({ input }) => {
      return calculatePasswordStrength(input.password);
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const userResult = await ctx.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    const user = userResult[0];
    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    return user;
  }),
});
