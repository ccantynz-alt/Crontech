import { type ScopedQueryClient, db, scopedDb } from "@back-to-the-future/db";
import type { Context } from "hono";
import { getUserIdFromHeader } from "../auth/middleware";

type Database = typeof db;

export interface TRPCContext {
  db: Database;
  userId: string | null;
  sessionToken: string | null;
  csrfToken: string | null;
  /**
   * Machine-to-machine service API key, read from the `X-Service-Key`
   * request header. Only non-null when the GlueCron (or another
   * authorised service) includes the header. Validated against
   * `GLUECRON_SERVICE_KEY` by the `serviceKeyProcedure` middleware in
   * `procedures/gluecron.ts`.
   */
  serviceKey: string | null;
  /**
   * Tenant-scoped database client. Auto-injects userId filtering on
   * every SELECT, INSERT, UPDATE, DELETE. Only available when userId
   * is set (i.e., authenticated requests). For unauthenticated
   * requests, this is null — use `ctx.db` for public procedures.
   *
   * Admin procedures that need cross-tenant access should use `ctx.db`.
   */
  scopedDb: ScopedQueryClient | null;
}

export async function createContext(c: Context): Promise<TRPCContext> {
  const userId = await getUserIdFromHeader(c);

  const authHeader = c.req.header("Authorization");
  const sessionToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const csrfToken = c.req.header("X-CSRF-Token") ?? null;
  const serviceKey = c.req.header("X-Service-Key") ?? null;

  return {
    db,
    userId,
    sessionToken,
    csrfToken,
    serviceKey,
    scopedDb: userId ? scopedDb(db, userId) : null,
  };
}
