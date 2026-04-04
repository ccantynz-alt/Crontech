import { z } from "zod";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import { auditLogs, users } from "@cronix/db";
import type { Database } from "@cronix/db";
import { PaginationInput } from "@cronix/schemas";
import {
  verifyChain,
  verifyEntry,
  type AuditEntryWithHash,
} from "../../audit/hash-chain";
import { RoleSchema, roleHasAllPermissions } from "../../auth/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertAuditAccess(
  db: Database,
  userId: string,
): Promise<void> {
  const result = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  const parsed = RoleSchema.safeParse(user.role);
  if (!parsed.success || !roleHasAllPermissions(parsed.data, ["admin:audit_logs"])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to access audit logs",
    });
  }
}

// ---------------------------------------------------------------------------
// Filter Schema
// ---------------------------------------------------------------------------

const AuditFilterInput = z.object({
  actorId: z.string().optional(),
  action: z
    .enum(["CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "SIGN"])
    .optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Enhanced Audit Router
// ---------------------------------------------------------------------------

export const auditEnhancedRouter = router({
  /**
   * Paginated audit log with filters.
   * Requires admin:audit_logs permission.
   */
  getLog: protectedProcedure
    .input(
      PaginationInput.merge(AuditFilterInput),
    )
    .query(async ({ ctx, input }) => {
      await assertAuditAccess(ctx.db, ctx.userId);

      const { cursor, limit, ...filters } = input;
      const conditions = [];

      if (cursor) {
        // Use cursor-based pagination: entries older than cursor
        const cursorEntry = await ctx.db
          .select({ timestamp: auditLogs.timestamp })
          .from(auditLogs)
          .where(eq(auditLogs.id, cursor))
          .limit(1);

        if (cursorEntry[0]) {
          conditions.push(lte(auditLogs.timestamp, cursorEntry[0].timestamp));
        }
      }

      if (filters.actorId) {
        conditions.push(eq(auditLogs.actorId, filters.actorId));
      }
      if (filters.action) {
        conditions.push(eq(auditLogs.action, filters.action));
      }
      if (filters.resourceType) {
        conditions.push(eq(auditLogs.resourceType, filters.resourceType));
      }
      if (filters.resourceId) {
        conditions.push(eq(auditLogs.resourceId, filters.resourceId));
      }
      if (filters.dateFrom) {
        conditions.push(gte(auditLogs.timestamp, filters.dateFrom));
      }
      if (filters.dateTo) {
        conditions.push(lte(auditLogs.timestamp, filters.dateTo));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const items = await ctx.db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const resultItems = hasMore ? items.slice(0, limit) : items;
      const nextCursor =
        hasMore
          ? (resultItems[resultItems.length - 1]?.id ?? null)
          : null;

      const totalResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereClause);
      const total = totalResult[0]?.count ?? 0;

      return {
        items: resultItems,
        nextCursor,
        total,
      };
    }),

  /**
   * Verify integrity of the audit log hash chain.
   * Requires admin:audit_logs permission.
   */
  verifyIntegrity: protectedProcedure
    .input(
      z.object({
        startId: z.string().optional(),
        endId: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAuditAccess(ctx.db, ctx.userId);

      const result = await verifyChain(input?.startId, input?.endId);
      return result;
    }),

  /**
   * Get a single audit entry with hash verification.
   * Requires admin:audit_logs permission.
   */
  getEntry: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertAuditAccess(ctx.db, ctx.userId);

      const result = await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, input.id))
        .limit(1);

      const entry = result[0];
      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Audit entry not found: ${input.id}`,
        });
      }

      const entryWithHash: AuditEntryWithHash = {
        id: entry.id,
        timestamp: entry.timestamp,
        actorId: entry.actorId,
        actorIp: entry.actorIp ?? null,
        actorDevice: entry.actorDevice ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        detail: entry.detail ?? null,
        result: entry.result,
        sessionId: entry.sessionId ?? null,
        previousHash: entry.previousHash ?? null,
        entryHash: entry.entryHash,
        signature: entry.signature ?? null,
      };

      const hashValid = await verifyEntry(entryWithHash);

      return {
        entry: entryWithHash,
        hashValid,
      };
    }),

  /**
   * Export audit log as JSON with hash chain for external verification.
   * Requires admin:audit_logs permission.
   */
  exportLog: protectedProcedure
    .input(
      z.object({
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        format: z.enum(["json"]).default("json"),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertAuditAccess(ctx.db, ctx.userId);

      const conditions = [];
      if (input?.dateFrom) {
        conditions.push(gte(auditLogs.timestamp, input.dateFrom));
      }
      if (input?.dateTo) {
        conditions.push(lte(auditLogs.timestamp, input.dateTo));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const entries = await ctx.db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(auditLogs.timestamp);

      // Run chain verification on the exported range
      const verification = await verifyChain(
        entries[0]?.id,
        entries[entries.length - 1]?.id,
      );

      return {
        exportedAt: new Date().toISOString(),
        totalEntries: entries.length,
        chainIntegrity: verification,
        entries,
      };
    }),
});
