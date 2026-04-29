import { apiKeys } from "@back-to-the-future/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../init";

/**
 * Hash a raw API key using SHA-256.
 * We never store the raw key -- only the hash.
 */
async function hashApiKey(rawKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a cryptographically random API key with the btf_sk_ prefix.
 */
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `btf_sk_${hex}`;
}

export const apiKeysRouter = router({
  /**
   * Create a new API key. Returns the raw key ONCE -- it is never stored.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rawKey = generateApiKey();
      const keyHash = await hashApiKey(rawKey);
      const prefix = rawKey.slice(0, 15); // "btf_sk_" + first 8 hex chars
      const id = crypto.randomUUID();

      await ctx.db.insert(apiKeys).values({
        id,
        userId: ctx.userId,
        keyHash,
        prefix,
        name: input.name,
        expiresAt: input.expiresAt ?? null,
        createdAt: new Date(),
      });

      return {
        id,
        name: input.name,
        prefix,
        rawKey, // Only returned once -- client must save it
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt?.toISOString() ?? null,
      };
    }),

  /**
   * List all API keys for the authenticated user (masked).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.userId));

    return keys.map((key) => ({
      ...key,
      maskedKey: `${key.prefix}${"*".repeat(49)}`,
    }));
  }),

  /**
   * Revoke (delete) an API key.
   */
  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.userId)))
        .returning();

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found or does not belong to you.",
        });
      }

      return { success: true as const, id: input.id };
    }),

  /**
   * Verify an API key is valid (internal use).
   * Accepts the raw key, hashes it, and looks it up.
   */
  verify: protectedProcedure
    .input(z.object({ rawKey: z.string() }))
    .query(async ({ ctx, input }) => {
      const keyHash = await hashApiKey(input.rawKey);

      const results = await ctx.db
        .select({
          id: apiKeys.id,
          userId: apiKeys.userId,
          name: apiKeys.name,
          expiresAt: apiKeys.expiresAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);

      const key = results[0];
      if (!key) {
        return {
          valid: false as const,
          userId: null as string | null,
          keyId: null as string | null,
        };
      }

      // Check expiration
      if (key.expiresAt && key.expiresAt < new Date()) {
        return {
          valid: false as const,
          userId: null as string | null,
          keyId: null as string | null,
        };
      }

      // Update last used timestamp
      await ctx.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

      return { valid: true as const, userId: key.userId, keyId: key.id };
    }),
});
