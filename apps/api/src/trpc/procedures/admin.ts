import { estimateCost } from "@back-to-the-future/ai-core";
import {
  analyticsEvents,
  chatMessages,
  conversations,
  deployments,
  payments,
  sessions,
  subscriptions,
  users,
} from "@back-to-the-future/db";
import { TRPCError } from "@trpc/server";
import { desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getAllFlags, isFeatureEnabled, updateFlagPersisted } from "../../feature-flags";
import { auditMiddleware } from "../../middleware/audit";
import { adminProcedure, router } from "../init";

// ── Zod Output Schemas ───────────────────────────────────────────────
//
// BLK-013: `admin.stats` is the single aggregator that backs the five
// dashboard tiles on /admin. The output schema is exported and used
// verbatim by `.output()` below so the shape is enforced at both
// compile-time and run-time. The admin.tsx static-source test pins
// the exact field list so future refactors cannot silently drift.

export const adminStatsOutputSchema = z.object({
  totalUsers: z.number(),
  activeSessions: z.number(),
  totalDeployments: z.number(),
  deploymentsThisMonth: z.number(),
  claudeSpendMonthUsd: z.number(),
});

// ── Admin Router ─────────────────────────────────────────────────────

export const adminRouter = router({
  getStats: adminProcedure.query(async ({ ctx }) => {
    const totalUsersResult = await ctx.db.select({ count: sql<number>`count(*)` }).from(users);
    const totalUsers = totalUsersResult[0]?.count ?? 0;

    const activeSubsResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));
    const activeSubscriptions = activeSubsResult[0]?.count ?? 0;

    const revenueResult = await ctx.db
      .select({ total: sql<number>`coalesce(sum(amount), 0)` })
      .from(payments)
      .where(eq(payments.status, "succeeded"));
    const totalRevenue = revenueResult[0]?.total ?? 0;

    const aiGenResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.category, "ai_generation"));
    const aiGenerations = aiGenResult[0]?.count ?? 0;

    return {
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      aiGenerations,
    };
  }),

  /**
   * BLK-013 — The unified 5-tile aggregator for /admin.
   *
   * Returns:
   *   - totalUsers             : COUNT(*) FROM users
   *   - activeSessions         : sessions created in the trailing 24h
   *   - totalDeployments       : COUNT(*) FROM deployments
   *   - deploymentsThisMonth   : deployments where created_at >= month-start (UTC)
   *   - claudeSpendMonthUsd    : sum of chat_messages cost for the current
   *                              month, rounded to two decimal places.
   *
   * Zod-validated via `adminStatsOutputSchema` so the shape cannot drift
   * between server and client without a test failure.
   */
  stats: adminProcedure.output(adminStatsOutputSchema).query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Total users
    const totalUsersRow = await ctx.db.select({ count: sql<number>`count(*)` }).from(users);
    const totalUsers = Number(totalUsersRow[0]?.count ?? 0);

    // Active sessions (created in the last 24h)
    const activeSessionsRow = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(gte(sessions.createdAt, last24h));
    const activeSessions = Number(activeSessionsRow[0]?.count ?? 0);

    // Total deployments (all time)
    const totalDeploymentsRow = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(deployments);
    const totalDeployments = Number(totalDeploymentsRow[0]?.count ?? 0);

    // Deployments created this calendar month (UTC)
    const deploymentsThisMonthRow = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(deployments)
      .where(gte(deployments.createdAt, monthStart));
    const deploymentsThisMonth = Number(deploymentsThisMonthRow[0]?.count ?? 0);

    // Claude spend for the current month: sum estimated cost across
    // chat_messages created >= monthStart. estimateCost returns
    // microdollars, so divide by 1e6 and round to 2dp.
    const monthlyMessages = await ctx.db
      .select({
        model: chatMessages.model,
        inputTokens: chatMessages.inputTokens,
        outputTokens: chatMessages.outputTokens,
      })
      .from(chatMessages)
      .innerJoin(conversations, eq(chatMessages.conversationId, conversations.id))
      .where(gte(chatMessages.createdAt, monthStart));

    let monthCostMicro = 0;
    for (const row of monthlyMessages) {
      if (!row.model) continue;
      const input = row.inputTokens ?? 0;
      const output = row.outputTokens ?? 0;
      monthCostMicro += estimateCost(row.model, input, output);
    }
    const claudeSpendMonthUsd = Math.round((monthCostMicro / 1_000_000) * 100) / 100;

    return {
      totalUsers,
      activeSessions,
      totalDeployments,
      deploymentsThisMonth,
      claudeSpendMonthUsd,
    };
  }),

  getRecentUsers: adminProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(20);

    return items;
  }),

  getRecentPayments: adminProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select({
        id: payments.id,
        userId: payments.userId,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(20);

    return items;
  }),

  toggleFeatureFlag: adminProcedure
    .use(auditMiddleware("admin.toggleFeatureFlag"))
    .input(
      z.object({
        key: z.string().min(1),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const updated = await updateFlagPersisted(input.key, { enabled: input.enabled });
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Feature flag not found: ${input.key}`,
        });
      }
      return updated;
    }),

  getSystemHealth: adminProcedure.query(async ({ ctx }) => {
    // Database health check
    let dbStatus: "ok" | "error" = "ok";
    try {
      await ctx.db.select({ one: sql<number>`1` }).from(users).limit(1);
    } catch {
      dbStatus = "error";
    }

    // Feature flags loaded
    const flagCount = getAllFlags().length;

    return {
      api: "ok" as const,
      database: dbStatus,
      sentinel:
        flagCount > 0 && isFeatureEnabled("sentinel.monitoring")
          ? ("active" as const)
          : ("inactive" as const),
      websocket: "ok" as const,
      flagsLoaded: flagCount,
      timestamp: new Date().toISOString(),
    };
  }),

  /** Set a user's role. Admin only. Cannot demote yourself. */
  setUserRole: adminProcedure
    .use(auditMiddleware("admin.setUserRole"))
    .input(
      z.object({
        userId: z.string().min(1),
        role: z.enum(["admin", "editor", "viewer"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Prevent admins from demoting themselves
      if (input.userId === ctx.userId && input.role !== "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change your own admin role. Another admin must do this.",
        });
      }

      const existing = await ctx.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }

      await ctx.db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));

      return {
        userId: input.userId,
        previousRole: existing[0]?.role,
        newRole: input.role,
      };
    }),
});
