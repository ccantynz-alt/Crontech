import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { validateSession } from "./session";
import { db } from "@back-to-the-future/db";

export interface AuthEnv {
  Variables: {
    userId: string | null;
  };
}

/**
 * Hono middleware that extracts session token from Authorization header,
 * validates it, and attaches the userId to the context.
 *
 * Token format: "Bearer <token>"
 */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    c.set("userId", null);
    await next();
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    c.set("userId", null);
    await next();
    return;
  }

  const userId = await validateSession(token, db);
  c.set("userId", userId);
  await next();
});

/**
 * Helper to extract the session token from a Hono context for use in tRPC.
 * Returns the userId if the session is valid, null otherwise.
 */
export async function getUserIdFromHeader(
  c: Context,
): Promise<string | null> {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  if (!token) {
    return null;
  }

  return validateSession(token, db);
}
