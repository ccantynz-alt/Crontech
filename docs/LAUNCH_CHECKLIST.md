# Crontech Launch Checklist

One-page go-live sequence for Crontech. Work top to bottom. Do not skip steps. Stripe will not clear the account for production unless all of §1 and §2 are complete.

---

## 1. AlecRae (transactional email) — required before Stripe

AlecRae sends email verification, password reset, welcome, subscription receipts, deploy notifications, and every other outbound mail. Without it, nobody can verify an email and therefore nobody can pay.

1. Log in to the AlecRae dashboard and create a tenant named `crontech`.
2. Add the sender domain `mail.crontech.ai`.
3. AlecRae shows DKIM, SPF, and DMARC records — paste those into Cloudflare DNS for `crontech.ai`.
4. Wait for AlecRae to verify the domain (polls DNS automatically, usually under 5 min).
5. Create 10 templates (content can be iterated later, IDs must be exact):
    - `crontech.verify-email`
    - `crontech.welcome`
    - `crontech.password-reset`
    - `crontech.magic-link`
    - `crontech.waitlist-confirm`
    - `crontech.subscription-created`
    - `crontech.payment-failed`
    - `crontech.deploy-success`
    - `crontech.deploy-failure`
    - `crontech.custom-domain-verified`
6. Generate an AlecRae API key scoped to the `crontech` tenant. Copy it.
7. In Vercel → Crontech project → Environment Variables (Production), set:
    - `ALECRAE_API_URL` = `https://api.alecrae.com/v1`
    - `ALECRAE_API_KEY` = the key from step 6
    - `EMAIL_FROM` = `Crontech <noreply@mail.crontech.ai>`
8. Configure AlecRae's outbound webhook to POST to `https://crontech.ai/api/alecrae/webhook` with the `ALECRAE_WEBHOOK_SECRET` you set in Vercel.

## 2. Stripe (payments)

1. Create a Stripe account (or switch to live mode on the existing one).
2. In the Stripe dashboard → Products, create two products:
    - **Crontech Pro** — monthly recurring — price $29 USD
    - **Crontech Enterprise** — monthly recurring — price $99 USD (or your chosen anchor)
3. Copy each product's Price ID (they look like `price_1AbCdEf…`, 30 characters, no underscores after `price_`).
4. In Vercel → Crontech project → Environment Variables (Production), set:
    - `STRIPE_SECRET_KEY` = your **live** secret key (`sk_live_…`)
    - `STRIPE_PUBLISHABLE_KEY` = your **live** publishable key (`pk_live_…`)
    - `STRIPE_PRICE_PRO_MONTHLY` = the Pro Price ID from step 3
    - `STRIPE_PRICE_ENTERPRISE_MONTHLY` = the Enterprise Price ID from step 3
5. Create a Stripe webhook endpoint at `https://api.crontech.ai/api/stripe/webhook`. Subscribe to at minimum: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
6. Copy the webhook signing secret (`whsec_…`) and set `STRIPE_WEBHOOK_SECRET` in Vercel prod env.
7. **Last step — flip the kill switch**: set `STRIPE_ENABLED=true` in Vercel prod env.
8. Redeploy Crontech so the new env is picked up.

Do the same exercise in a separate Vercel environment (Preview or Staging) with Stripe **test** keys and test price IDs before touching prod.

## 3. Verify end-to-end before announcing

Use a clean incognito window with a fresh throwaway email address. Walk the full funnel:

1. Open `https://crontech.ai` → click **Start building** → land on `/register`.
2. Sign up with email + password (or Google OAuth).
3. Check inbox — should receive a Crontech verification email via AlecRae within 60s.
4. Click the verify link → land on `/dashboard?verified=1` with the welcome email already in your inbox.
5. Click **Upgrade** or navigate to `/pricing` → click the **Pro** plan CTA.
6. Complete Stripe checkout using a real card (or `4242 4242 4242 4242` if you're in test mode).
7. Confirm Stripe dashboard shows the new subscription.
8. Confirm Crontech admin page (`/admin`) shows the new user with an active subscription.
9. Confirm you received the `crontech.subscription-created` email.
10. Create a project from the dashboard — confirm you can reach `projects.create` and the project row appears.

If any step fails, do not launch. Check the troubleshooting section below.

## 4. Dogfood dependencies (other products you'll need warm)

Crontech is the first to go live, but it dogfoods three siblings. Each must be at least reachable before launch so the cross-product admin widget and customer cross-sell card don't show "unreachable":

- `https://alecrae.com/api/platform-status` (sends Crontech's email — hard dependency)
- `https://gluecron.com/api/platform-status` (git hosting — eventual dependency)
- `https://gatetest.io/api/platform-status` (CI gate — already running on Crontech's pushes)

## 5. Troubleshooting

- **Verification email never arrives** — check `ALECRAE_API_KEY` is set in Vercel prod, check AlecRae logs for the `message_id`, check DKIM/SPF/DMARC are green in AlecRae.
- **"Billing is not yet operational"** on `/pricing` → `STRIPE_ENABLED` is still `false` in Vercel.
- **PRECONDITION_FAILED: Stripe price "..." is not configured** → `STRIPE_PRICE_PRO_MONTHLY` or `STRIPE_PRICE_ENTERPRISE_MONTHLY` is empty or still a placeholder. Paste real Stripe price IDs.
- **PRECONDITION_FAILED on checkout for your user** → you haven't verified your email. Check inbox, click verify link, retry.
- **Stripe checkout loads but card is rejected** → you're using test keys in prod (or vice versa).
- **Webhook signature invalid** → `STRIPE_WEBHOOK_SECRET` in Vercel doesn't match the secret shown in the Stripe dashboard for that specific webhook endpoint.
- **User signed up but isn't in the admin user list** → Turso DB connection env vars (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`) are misconfigured.

## 6. After launch — within 24h

- Open the admin `/admin` page. Watch signup funnel for one full day.
- Check AlecRae bounce rate < 2% and complaint rate < 0.1%. If either is high, pause and investigate before sending more.
- Check Stripe for failed payments. `payment_failed` emails should be going out automatically via the `crontech.payment-failed` template.
- Spot-check that the GateTest CI gate is still green on new Crontech commits.

---

Last updated: 2026-04-22.
