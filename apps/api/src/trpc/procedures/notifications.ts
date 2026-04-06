import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { notifications } from "@back-to-the-future/db";

export const notificationsRouter = router({
  getUnread: protectedProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.read, false),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return items;
  }),

  getAll: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, ctx.userId))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = items.length > input.limit;
      const resultItems = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore
        ? resultItems[resultItems.length - 1]?.id ?? null
        : null;

      const totalResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(eq(notifications.userId, ctx.userId));
      const total = totalResult[0]?.count ?? 0;

      return { items: resultItems, nextCursor, total };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.userId),
          ),
        )
        .returning();

      if (result.length === 0) {
        return { success: false as const };
      }
      return { success: true as const };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, ctx.userId),
          eq(notifications.read, false),
        ),
      );

    return { success: true as const };
  }),
});
