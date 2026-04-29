import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Returns true when the Stripe integration is globally enabled. We read the
 * env flag lazily so tests can toggle it per-case and so module import never
 * triggers a Stripe SDK construction.
 */
export function isStripeEnabled(): boolean {
  const flag = process.env.STRIPE_ENABLED;
  return flag === "true" || flag === "1";
}

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

/**
 * BLK-010: Create a Stripe Billing Portal session for an existing Customer.
 *
 * Returns the portal URL the caller should redirect the user to. Throws when
 * STRIPE_ENABLED is not truthy — we never want to ping Stripe before Craig
 * has flipped the feature flag on.
 *
 * This is plumbing only. No pricing, no plan configuration — Stripe owns the
 * portal configuration via its own dashboard.
 */
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<string> {
  if (!isStripeEnabled()) {
    throw new Error("Stripe is not enabled (STRIPE_ENABLED env flag is not 'true' or '1').");
  }
  if (!stripeCustomerId) {
    throw new Error("stripeCustomerId is required");
  }
  if (!returnUrl) {
    throw new Error("returnUrl is required");
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}
