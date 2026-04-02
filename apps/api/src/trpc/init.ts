import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCContext } from "./context";

// Ensure schema types are available for inferred type portability
// This import is needed so TypeScript can name the inferred types of procedures
// that reference the database context.
import type * as _schema from "@back-to-the-future/db";

export type { TRPCContext };

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * Middleware that enforces authentication.
 * Throws UNAUTHORIZED if no valid session token is present.
 */
const enforceAuth = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/**
 * Protected procedure that requires a valid session.
 * Throws UNAUTHORIZED if no valid session token is present.
 */
export const protectedProcedure = t.procedure.use(enforceAuth);
