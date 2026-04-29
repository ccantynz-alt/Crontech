// ── /docs/api-reference/billing — Billing procedure reference ──────
//
// Documents the `billing.*` router as it ships today, including the
// STRIPE_ENABLED pre-launch guard. Names and shapes are pulled from
// apps/api/src/trpc/procedures/billing.ts — no aspirational endpoints.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import { Callout, DocsArticle, KeyList } from "../../../components/docs/DocsArticle";

export default function BillingReference(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference — Billing"
        description="tRPC billing router: status probe, waitlist, plan catalogue, Stripe checkout + portal, subscription state, usage reporting. ENV-gated until launch."
        path="/docs/api-reference/billing"
      />

      <DocsArticle
        eyebrow="API Reference · Billing"
        title="Billing procedures"
        subtitle="The billing.* router wraps Stripe: plan catalogue, checkout sessions, customer portal, subscription state, and metered usage reporting. The whole surface is ENV-gated until launch — the UI is built to notice."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "DNS & Domains procedures",
          href: "/docs/api-reference/dns-and-domains",
          description: "Wire a custom domain, register a new one, or manage DNS records.",
        }}
      >
        <p>
          Billing is the only router in the stack that can be globally switched off. That's
          deliberate — Crontech is in pre-launch until Craig flips the switch, and every
          checkout-creating procedure short-circuits with a clean <code>SERVICE_UNAVAILABLE</code>{" "}
          response until then.
        </p>

        <Callout tone="warn" title="STRIPE_ENABLED pre-launch guard">
          The router reads <code>process.env.STRIPE_ENABLED</code> and defaults to{" "}
          <code>false</code>. Until that flag is <code>"true"</code>, every payment-creating
          mutation returns <code>SERVICE_UNAVAILABLE</code> with the message "Billing is not yet
          operational. Crontech is in pre-launch." The UI detects this via{" "}
          <code>billing.getStatus</code> and renders a waitlist form instead of a broken checkout
          button. Webhook handlers are intentionally <em>not</em> gated — they must still parse any
          late-firing Stripe event defensively.
        </Callout>

        <h2>Status + waitlist (always public)</h2>

        <h3>
          <code>billing.getStatus</code>
        </h3>
        <p>
          Public <em>query</em>. No input. Returns <code>{"{ enabled: boolean }"}</code>. Never
          throws — the UI calls this before deciding whether to render checkout or the pre-launch
          surface.
        </p>

        <h3>
          <code>billing.joinWaitlist</code>
        </h3>
        <p>
          Public <em>mutation</em>. Input <code>{"{ email: z.string().email() }"}</code>.
          Best-effort — even if the notification email fails to dispatch, the caller always sees a
          clean ack. A local log line keeps a trail for manual recovery.
        </p>

        <h2>Plan catalogue (always public)</h2>

        <h3>
          <code>billing.getPlans</code>
        </h3>
        <p>
          Public <em>query</em>. No input. Returns the hard-coded plan list (Free, Pro at $29/mo,
          Enterprise). The Stripe price IDs come from <code>STRIPE_PRICE_PRO_MONTHLY</code> /{" "}
          <code>STRIPE_PRICE_ENTERPRISE_MONTHLY</code> env vars — if unset, the UI still renders the
          tier with a "contact sales" CTA.
        </p>

        <h2>Subscription state (protected)</h2>

        <h3>
          <code>billing.getSubscription</code>
        </h3>
        <p>
          Protected <em>query</em>. No input. Returns the caller's subscription row (plan id,
          status, renewal date) or <code>null</code> if they're on Free. Does not touch Stripe on
          the read path — state lives in the <code>subscriptions</code> table and is kept in sync by
          webhook handlers.
        </p>

        <h3>
          <code>billing.getCurrentUsage</code>
        </h3>
        <p>
          Protected <em>query</em>. No input. Returns the caller's current-month usage totals —
          build minutes, AI tokens, storage — for the dashboard's usage widget.
        </p>

        <h2>Checkout + portal (ENV-gated)</h2>

        <h3>
          <code>billing.createCheckoutSession</code>
        </h3>
        <p>
          Protected <em>mutation</em>. Input:
        </p>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`z.object({
  planId: z.enum(["pro", "enterprise"]),
  returnUrl: z.string().url().optional(),
})`}</code>
        </pre>
        <p>
          Creates a Stripe Checkout session and returns <code>{"{ url: string }"}</code>. Throws{" "}
          <code>SERVICE_UNAVAILABLE</code> when billing is disabled.
        </p>

        <h3>
          <code>billing.createPortalSession</code>
        </h3>
        <p>
          Protected <em>mutation</em>. Input <code>{"{ returnUrl?: string }"}</code>. Creates a
          Stripe Customer Portal session so the caller can update payment methods, view invoices, or
          cancel. Same pre-launch guard.
        </p>

        <h2>Admin-only</h2>

        <h3>
          <code>billing.reportUsage</code>
        </h3>
        <p>
          Admin <em>mutation</em>. Input <code>{"{ userId: string }"}</code> or no input to report
          all pending. Pushes aggregated metered usage to Stripe via the usage-reporter subsystem.
          Typically triggered by a cron, not a human.
        </p>

        <h3>
          <code>billing.getPortalUrl</code>
        </h3>
        <p>
          Admin <em>mutation</em>. Input <code>{"{ userId: string }"}</code>. Generates a portal URL
          on behalf of a specific user — used by the admin console for support-side account
          management.
        </p>

        <h2>Handling the pre-launch case on the client</h2>
        <pre
          class="docs-pre"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
            "border-radius": "0.75rem",
            padding: "1rem",
            overflow: "auto",
            "font-size": "0.85rem",
          }}
        >
          <code>{`const { enabled } = await trpc.billing.getStatus.query();

if (!enabled) {
  // Render the waitlist form. Do NOT call createCheckoutSession.
  return <PreLaunchBilling />;
}

const { url } = await trpc.billing.createCheckoutSession.mutate({
  planId: "pro",
});
window.location.href = url;`}</code>
        </pre>

        <Callout tone="note">
          Webhook handlers live outside tRPC at <code>/webhooks/stripe</code>. They are always on,
          even when <code>STRIPE_ENABLED</code> is false, so that any late-firing event after a flag
          toggle can still be reconciled.
        </Callout>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "usage.*",
              description:
                "Per-user usage accounting. Aggregated here before billing.reportUsage pushes to Stripe.",
            },
            {
              term: "email.*",
              description: "Outbound email used by joinWaitlist for the interest acknowledgement.",
            },
            {
              term: "admin.*",
              description:
                "Admin-only procedures for on-behalf operations — listing users, issuing credits, patching subscription state.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
