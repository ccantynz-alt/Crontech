import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../init";
import { createCheckoutSession, createPortalSession } from "../../stripe/checkout";

const hardcodedPlans = [
  {
    id: "free",
    name: "Free",
    description: "Get started with the basics",
    stripePriceId: "",
    price: 0,
    interval: "monthly" as const,
    features: JSON.stringify(["1 project", "Basic AI builder", "Community support"]),
    isActive: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For professionals and teams",
    stripePriceId: "price_pro_monthly",
    price: 2900,
    interval: "monthly" as const,
    features: JSON.stringify(["Unlimited projects", "Advanced AI builder", "Video editor", "Real-time collaboration", "Priority support"]),
    isActive: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom solutions for large organizations",
    stripePriceId: "price_enterprise_monthly",
    price: 9900,
    interval: "monthly" as const,
    features: JSON.stringify(["Everything in Pro", "Custom AI agents", "Sentinel intelligence", "SSO / SAML", "Dedicated support", "SLA guarantee"]),
    isActive: true,
  },
];

export const billingRouter = router({
  getPlans: publicProcedure.query(() => {
    return hardcodedPlans.filter((p) => p.isActive);
  }),

  getSubscription: protectedProcedure.query(({ ctx }) => {
    // Placeholder - would query DB in production
    return {
      status: "free" as const,
      plan: "Free",
      userId: ctx.userId,
    };
  }),

  createCheckoutSession: protectedProcedure
    .input(z.object({ priceId: z.string() }))
    .mutation(async ({ input }) => {
      return createCheckoutSession({ priceId: input.priceId });
    }),

  createPortalSession: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .mutation(async ({ input }) => {
      return createPortalSession({ customerId: input.customerId });
    }),
});
