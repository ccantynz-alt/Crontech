// ── Accounting Vertical Schemas ───────────────────────────────────
// Zod schemas for the accounting product surface (clients, invoices,
// expenses, taxes, journal entries, financial accounts).
//
// All monetary amounts are stored as integer minor units (cents) to
// avoid floating-point rounding errors. Convert at the UI boundary.

import { z } from "zod";

// ── Primitives ─────────────────────────────────────────────────────

export const CurrencyCode = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code");

export const MoneyMinor = z.number().int().min(0);

// ── Client ─────────────────────────────────────────────────────────

export const ClientSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().max(200).nullable().optional(),
  taxId: z.string().max(64).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  contactPerson: z.string().max(200).nullable().optional(),
});
export type Client = z.infer<typeof ClientSchema>;

export const ClientCreateSchema = ClientSchema.omit({ id: true });
export const ClientUpdateSchema = ClientCreateSchema.partial().extend({
  id: z.string(),
});

// ── Line Items ─────────────────────────────────────────────────────

export const LineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).max(100000),
  rate: MoneyMinor,
  amount: MoneyMinor,
  taxRate: z.number().min(0).max(100).optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

// ── Invoice ────────────────────────────────────────────────────────

export const InvoiceStatus = z.enum([
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const PaymentTerms = z.enum([
  "due_on_receipt",
  "net_7",
  "net_15",
  "net_30",
  "net_60",
]);

export const InvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string().min(1).max(64),
  clientId: z.string(),
  status: InvoiceStatus,
  issueDate: z.date(),
  dueDate: z.date(),
  lineItems: z.array(LineItemSchema),
  subtotal: MoneyMinor,
  taxAmount: MoneyMinor,
  total: MoneyMinor,
  currency: CurrencyCode,
  paymentTerms: PaymentTerms.optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoiceCreateSchema = z.object({
  clientId: z.string(),
  invoiceNumber: z.string().min(1).max(64),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: CurrencyCode.default("USD"),
  paymentTerms: PaymentTerms.optional(),
  notes: z.string().max(2000).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number().int().min(1),
        rate: MoneyMinor,
      }),
    )
    .min(1, "An invoice must have at least one line item"),
  taxRate: z.number().min(0).max(100).default(0),
});

// ── Expense ────────────────────────────────────────────────────────

export const ExpenseCategory = z.enum([
  "advertising",
  "software",
  "travel",
  "meals",
  "office",
  "utilities",
  "professional_services",
  "payroll",
  "rent",
  "other",
]);

export const ExpenseSchema = z.object({
  id: z.string(),
  date: z.date(),
  vendor: z.string().min(1).max(200),
  category: ExpenseCategory,
  amount: MoneyMinor,
  currency: CurrencyCode,
  receipt: z.string().url().nullable().optional(),
  deductible: z.boolean(),
  notes: z.string().max(2000).nullable().optional(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const ExpenseCreateSchema = ExpenseSchema.omit({ id: true }).extend({
  date: z.coerce.date(),
  currency: CurrencyCode.default("USD"),
});

// ── Tax Jurisdiction ───────────────────────────────────────────────

export const TaxJurisdictionSchema = z.object({
  id: z.string(),
  country: z.string().length(2),
  state: z.string().nullable().optional(),
  rate: z.number().min(0).max(100),
  type: z.enum(["vat", "gst", "sales_tax", "hst", "pst"]),
});
export type TaxJurisdiction = z.infer<typeof TaxJurisdictionSchema>;

// ── Financial Account ──────────────────────────────────────────────

export const FinancialAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  balance: z.number().int(),
  currency: CurrencyCode,
});
export type FinancialAccount = z.infer<typeof FinancialAccountSchema>;

// ── Journal Entry ──────────────────────────────────────────────────

export const JournalEntryLineSchema = z.object({
  accountId: z.string(),
  debit: MoneyMinor,
  credit: MoneyMinor,
});

export const JournalEntrySchema = z.object({
  id: z.string(),
  date: z.date(),
  description: z.string().min(1).max(500),
  debits: z.array(JournalEntryLineSchema),
  credits: z.array(JournalEntryLineSchema),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

// ── Recurring Invoice ──────────────────────────────────────────────

export const RecurringInvoiceSchema = z.object({
  id: z.string(),
  schedule: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly"]),
  nextDate: z.date(),
  clientId: z.string(),
  template: InvoiceSchema.omit({
    id: true,
    invoiceNumber: true,
    status: true,
    issueDate: true,
    dueDate: true,
  }),
});
export type RecurringInvoice = z.infer<typeof RecurringInvoiceSchema>;
