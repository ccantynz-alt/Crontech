// ── Accounting Router ──────────────────────────────────────────────
// Clients, invoices, expenses, financial reports and dashboard KPIs
// for the accounting vertical (accounting.crontech.ai).

import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  accountingClients,
  invoices,
  invoiceLineItems,
  expenses,
} from "@back-to-the-future/db";

function id(): string {
  return crypto.randomUUID();
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ── Clients sub-router ─────────────────────────────────────────────

const clientsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(accountingClients)
      .where(eq(accountingClients.userId, ctx.userId))
      .orderBy(desc(accountingClients.createdAt));
    return rows;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db
        .select()
        .from(accountingClients)
        .where(
          and(
            eq(accountingClients.id, input.id),
            eq(accountingClients.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (row.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }
      return row[0];
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email(),
        company: z.string().max(200).optional(),
        taxId: z.string().max(64).optional(),
        address: z.string().max(500).optional(),
        contactPerson: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const newId = id();
      await ctx.db.insert(accountingClients).values({
        id: newId,
        userId: ctx.userId,
        name: input.name,
        email: input.email,
        company: input.company ?? null,
        taxId: input.taxId ?? null,
        address: input.address ?? null,
        contactPerson: input.contactPerson ?? null,
      });
      return { id: newId, success: true as const };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        email: z.string().email().optional(),
        company: z.string().max(200).optional(),
        taxId: z.string().max(64).optional(),
        address: z.string().max(500).optional(),
        contactPerson: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id: clientId, ...rest } = input;
      await ctx.db
        .update(accountingClients)
        .set(rest)
        .where(
          and(
            eq(accountingClients.id, clientId),
            eq(accountingClients.userId, ctx.userId),
          ),
        );
      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(accountingClients)
        .where(
          and(
            eq(accountingClients.id, input.id),
            eq(accountingClients.userId, ctx.userId),
          ),
        );
      return { success: true as const };
    }),
});

// ── Invoices sub-router ────────────────────────────────────────────

const invoicesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "sent", "paid", "overdue", "void"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(invoices.userId, ctx.userId)];
      if (input?.status) conditions.push(eq(invoices.status, input.status));
      const rows = await ctx.db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.issueDate));
      return rows;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const inv = await ctx.db
        .select()
        .from(invoices)
        .where(
          and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)),
        )
        .limit(1);
      if (inv.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      const lines = await ctx.db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, input.id));
      return { invoice: inv[0], lineItems: lines };
    }),

  create: protectedProcedure
    .input(
      z.object({
        clientId: z.string(),
        invoiceNumber: z.string().min(1).max(64),
        issueDate: z.coerce.date(),
        dueDate: z.coerce.date(),
        currency: z.string().length(3).default("USD"),
        notes: z.string().max(2000).optional(),
        taxRate: z.number().min(0).max(100).default(0),
        lineItems: z
          .array(
            z.object({
              description: z.string().min(1).max(500),
              quantity: z.number().int().min(1),
              rate: z.number().int().min(0),
            }),
          )
          .min(1),
        sendNow: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const newId = id();
      const subtotal = input.lineItems.reduce(
        (sum, li) => sum + li.quantity * li.rate,
        0,
      );
      const taxAmount = Math.round((subtotal * input.taxRate) / 100);
      const total = subtotal + taxAmount;

      await ctx.db.insert(invoices).values({
        id: newId,
        userId: ctx.userId,
        clientId: input.clientId,
        invoiceNumber: input.invoiceNumber,
        status: input.sendNow ? "sent" : "draft",
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotal,
        taxAmount,
        total,
        currency: input.currency,
        notes: input.notes ?? null,
      });

      for (const li of input.lineItems) {
        await ctx.db.insert(invoiceLineItems).values({
          id: id(),
          invoiceId: newId,
          description: li.description,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.quantity * li.rate,
        });
      }

      return { id: newId, success: true as const };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().max(2000).optional(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id: invoiceId, ...rest } = input;
      await ctx.db
        .update(invoices)
        .set(rest)
        .where(
          and(eq(invoices.id, invoiceId), eq(invoices.userId, ctx.userId)),
        );
      return { success: true as const };
    }),

  markPaid: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(invoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(
          and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)),
        );
      return { success: true as const };
    }),

  send: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Wire to email provider in production. For now, mark as sent.
      await ctx.db
        .update(invoices)
        .set({ status: "sent" })
        .where(
          and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)),
        );
      return { success: true as const, message: "Invoice queued for delivery" };
    }),

  generatePdf: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await ctx.db
        .select()
        .from(invoices)
        .where(
          and(eq(invoices.id, input.id), eq(invoices.userId, ctx.userId)),
        )
        .limit(1);
      if (inv.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      // Stubbed for now; real PDF generation runs on edge worker.
      return {
        success: true as const,
        url: `/api/invoices/${input.id}/pdf`,
      };
    }),
});

// ── Expenses sub-router ────────────────────────────────────────────

const expensesRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(expenses.userId, ctx.userId)];
      if (input?.category) conditions.push(eq(expenses.category, input.category));
      const rows = await ctx.db
        .select()
        .from(expenses)
        .where(and(...conditions))
        .orderBy(desc(expenses.date));
      return rows;
    }),

  create: protectedProcedure
    .input(
      z.object({
        date: z.coerce.date(),
        vendor: z.string().min(1).max(200),
        category: z.string().min(1).max(100),
        amount: z.number().int().min(0),
        currency: z.string().length(3).default("USD"),
        deductible: z.boolean().default(true),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const newId = id();
      await ctx.db.insert(expenses).values({
        id: newId,
        userId: ctx.userId,
        date: input.date,
        vendor: input.vendor,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        deductible: input.deductible,
        notes: input.notes ?? null,
      });
      return { id: newId, success: true as const };
    }),

  categorize: protectedProcedure
    .input(z.object({ id: z.string(), category: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(expenses)
        .set({ category: input.category })
        .where(
          and(eq(expenses.id, input.id), eq(expenses.userId, ctx.userId)),
        );
      return { success: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(expenses)
        .where(
          and(eq(expenses.id, input.id), eq(expenses.userId, ctx.userId)),
        );
      return { success: true as const };
    }),
});

// ── Reports sub-router ─────────────────────────────────────────────

const reportsRouter = router({
  profitAndLoss: protectedProcedure
    .input(
      z.object({
        from: z.coerce.date(),
        to: z.coerce.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const revenueRows = await ctx.db
        .select({
          total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.userId, ctx.userId),
            eq(invoices.status, "paid"),
            gte(invoices.issueDate, input.from),
          ),
        );

      const expenseRows = await ctx.db
        .select({
          total: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.userId),
            gte(expenses.date, input.from),
          ),
        );

      const revenue = revenueRows[0]?.total ?? 0;
      const totalExpenses = expenseRows[0]?.total ?? 0;
      return {
        from: input.from,
        to: input.to,
        revenue,
        expenses: totalExpenses,
        netIncome: revenue - totalExpenses,
      };
    }),

  balanceSheet: protectedProcedure.query(async () => {
    return {
      assets: 0,
      liabilities: 0,
      equity: 0,
      asOf: new Date(),
    };
  }),

  cashFlow: protectedProcedure
    .input(z.object({ from: z.coerce.date(), to: z.coerce.date() }))
    .query(async ({ input }) => {
      return {
        from: input.from,
        to: input.to,
        operating: 0,
        investing: 0,
        financing: 0,
        netChange: 0,
      };
    }),

  taxSummary: protectedProcedure
    .input(z.object({ year: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const start = new Date(input.year, 0, 1);
      const taxRows = await ctx.db
        .select({
          total: sql<number>`coalesce(sum(${invoices.taxAmount}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.userId, ctx.userId),
            gte(invoices.issueDate, start),
          ),
        );
      return {
        year: input.year,
        taxCollected: taxRows[0]?.total ?? 0,
      };
    }),
});

// ── Dashboard sub-router ───────────────────────────────────────────

const dashboardRouter = router({
  getKpis: protectedProcedure.query(async ({ ctx }) => {
    const monthStart = startOfMonth();

    const outstandingRows = await ctx.db
      .select({
        total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.userId, ctx.userId),
          eq(invoices.status, "sent"),
        ),
      );

    const revenueRows = await ctx.db
      .select({
        total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.userId, ctx.userId),
          eq(invoices.status, "paid"),
          gte(invoices.issueDate, monthStart),
        ),
      );

    const expenseRows = await ctx.db
      .select({
        total: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, ctx.userId),
          gte(expenses.date, monthStart),
        ),
      );

    const outstandingInvoices = outstandingRows[0]?.total ?? 0;
    const revenueMtd = revenueRows[0]?.total ?? 0;
    const expensesMtd = expenseRows[0]?.total ?? 0;
    const profitMargin =
      revenueMtd > 0
        ? Math.round(((revenueMtd - expensesMtd) / revenueMtd) * 100)
        : 0;

    return {
      outstandingInvoices,
      revenueMtd,
      expensesMtd,
      profitMargin,
    };
  }),
});

// ── Root accounting router ─────────────────────────────────────────

export const accountingRouter = router({
  clients: clientsRouter,
  invoices: invoicesRouter,
  expenses: expensesRouter,
  reports: reportsRouter,
  dashboard: dashboardRouter,
});
