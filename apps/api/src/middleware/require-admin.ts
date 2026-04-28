/**
 * requireAdmin — Hono middleware that enforces admin role on a route.
 *
 * Reads the bearer session token → looks up the user → checks role === "admin".
 * Returns 401 for missing/invalid token, 403 for non-admin users.
 */

import { db } from "@back-to-the-future/db";
import { users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { validateSession } from "../auth/session";

export async function requireAdmin(c: Context, next: Next): Promise<Response | undefined> {
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const userId = await validateSession(token, db);
  if (!userId) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const rows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = rows[0]?.role;

  if (role !== "admin") {
    return c.json({ ok: false, error: "forbidden — admin role required" }, 403);
  }

  await next();
}
