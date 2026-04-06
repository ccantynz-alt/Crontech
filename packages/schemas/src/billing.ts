import { z } from "zod";

// ── Plan Schemas ─────────────────────────────────────────────────────

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  stripePriceId: z.string(),
  price: z.number().int(),
  interval: z.enum(["monthly", "yearly"]),
  features: z.string().nullable(),
  isActive: z.boolean(),
});

export type Plan = z.infer<typeof PlanSchema>;

// ── Subscription Schemas ─────────────────────────────────────────────

export const SubscriptionStatusSchema = z.enum([
  "active",
  "canceled",
  "past_due",
  "trialing",
]);

export const SubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  stripeCustomerId: z.string(),
  stripeSubscriptionId: z.string(),
  stripePriceId: z.string(),
  status: SubscriptionStatusSchema,
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

// ── Payment Schemas ──────────────────────────────────────────────────

export const PaymentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  stripePaymentIntentId: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
});

export type Payment = z.infer<typeof PaymentSchema>;

// ── Input Schemas ────────────────────────────────────────────────────

export const CreateCheckoutSessionInput = z.object({
  priceId: z.string(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const BillingPortalInput = z.object({
  returnUrl: z.string().url().optional(),
});
