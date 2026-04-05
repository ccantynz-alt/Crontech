import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCContext } from "./context";
import { tracer } from "../telemetry";
import { SpanStatusCode } from "@opentelemetry/api";

import type * as _schema from "@back-to-the-future/db";

export type { TRPCContext };

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const middleware = t.middleware;

// ── Tracing Middleware ──────────────────────────────────────────────
// Wraps every tRPC procedure call with an OpenTelemetry span.

const tracing = middleware(async ({ path, type, next }) => {
  return tracer.startActiveSpan(`trpc.${path}`, async (span) => {
    span.setAttribute("rpc.system", "trpc");
    span.setAttribute("rpc.method", path);
    span.setAttribute("rpc.type", type);
    try {
      const result = await next();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
});

export const publicProcedure = t.procedure.use(tracing);

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

export const protectedProcedure = t.procedure.use(tracing).use(enforceAuth);
