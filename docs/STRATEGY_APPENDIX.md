# STRATEGY — Appendix (2026-04-22 late evening)

**Read this alongside `docs/STRATEGY.md`. This appendix captures three major framings that surfaced late in the 2026-04-22 session and must survive into every future session. If you are a future Claude reading this — read `STRATEGY.md` first, then this file. Do not rewrite either. Append new appendices instead.**

---

## 1. The stealth-fortress doctrine

Crontech does NOT go loud on marketing until four fortress pillars are in place:

1. **Legal fortress** — incorporation, IP assignments, attorney-finalised ToS / Privacy / Cookie / DPA, trademark filings progressed to "published for opposition" on all four product names.
2. **Compliance fortress** — SOC 2 Type II audit engaged (not yet certified, but the process is running). GDPR + CCPA documentation trail exists. Cookie consent banner live.
3. **Infrastructure fortress** — each of the four products actually running on the stack they claim to run on, not just in marketing copy. Crontech hosts at least one sibling. Bounce + complaint handling for email is real.
4. **Financial fortress** — company bank account, clean books with accountant, Stripe live, first 10+ paying customers on real contracts for 2+ months.

Until all four pillars exist, the public face of Crontech is **quiet, professional, low-signal**. Visitors see "a modern developer platform with AI built in". They do NOT see aggressive positioning like "replaces Cloudflare + Render + Vercel + Mailgun + Twilio" — that phrasing alerts competitors and invites legal/acquisition pressure before the moat is ready.

The real billion-dollar positioning (see Appendix Section 3 below) lives in STRATEGY.md and BUILD_PLAN.md Phase 3 — not on the public landing page.

**Concrete implications for the landing page right now:**
- Remove / soften "replaces X" framing against named competitors
- Keep `SOC 2 Type II in progress` language (do NOT claim certification)
- Keep the mission statement and founder-pricing tone — those are values, not competitive threats
- Keep the `/solutions` verticals grid — showing breadth is fine, attacking incumbents is not
- Do NOT add `/vs-vercel`, `/vs-cloudflare`, or comparison pages in Phase 1. They belong in Phase 3.

**Silent giants win. Loud minnows get bought or squashed.**

---

## 2. Crontech's two-layer architecture (clarified by Craig)

Earlier this session I conflated "Crontech" with "AI website builder" — that's wrong. Crontech is **both layers** simultaneously, and future sessions must not drift into the "it's just a builder" framing.

### Layer 1 — Infrastructure (Crontech proper)
Replaces Cloudflare + Render + Vercel + Mailgun + Twilio. Hosting, database, auth, AI primitives, billing, email (via AlecRae), SMS. The bedrock. Recurring revenue per customer, compounding moat.

### Layer 2 — Consumer products running on Layer 1
- **AI Builder** (`/builder`) — describe your business, Claude ships it. Competes with v0.dev, Webflow, Squarespace, Wix.
- **URL Accelerator** (`/projects/new` paste-a-URL tile) — paste your WordPress URL, Crontech accelerates it. Competes with Cloudflare for SMB caching.
- **Vertical templates** (via `/solutions`) — restaurant, real estate, agency, creator, e-commerce, nonprofit, marketplace. Competes with vertical SaaS.
- **Agency white-label** — partner channel for WordPress agencies.

**These consumer products are not replacements for the infrastructure play. They are funnels INTO it.** Every SMB who uses the AI Builder becomes a Crontech hosting customer by definition — their generated site runs on Crontech's edge.

**The billionaire bet is owning BOTH layers simultaneously.** Nobody else in tech does this: Microsoft owns GitHub + Azure but bolted them together via acquisition. Google has Cloud + no consumer layer that matters. AWS is pure infra. Shopify owns storefronts + fulfillment but no infra primitives. Crontech natively owns the full stack from wire to business-outcome.

---

## 3. The four standalone products — each a billion-dollar market

Craig owns four products that each stand alone as commercial products in their own right. They dogfood each other but they are NOT dependencies of each other — a customer can sign up for any one without the others.

| Product | Replaces | Standalone market size | Comparable exits |
|---|---|---|---|
| **Crontech** | Cloudflare + Render + Vercel + Mailgun + Twilio + v0.dev + Webflow | $30-50B | Vercel ($3B→$10B+), Cloudflare ($40B public) |
| **Gluecron** | GitHub + GitLab + Bitbucket | $10-15B | GitHub→Microsoft $7.5B, GitLab $5B public |
| **Gatetest** | Playwright + Cypress + Percy + Chromatic + CI tooling | $2-5B | Percy→BrowserStack, Chromatic→Component Driven |
| **AlecRae** | Mailgun + SendGrid + Resend | $1-3B | SendGrid→Twilio $2B, Mailgun→SolarWinds ~$600M |

**Combined TAM if all four hit scale: $20-50B.**

This is not "Crontech might be a Vercel." This is "Craig is running four category-winners simultaneously, all dogfooding each other, which nobody else has the scope to do."

### Implications for marketing
- The "family of four" section on the Crontech landing page treats Gluecron / Gatetest / AlecRae as supporting cast. **That's wrong long-term.** Once fortress pillars are in place (Phase 2+), each product gets its own prominent positioning, not a footer link.
- Each product needs its own standalone landing page with its own pricing, its own sign-up flow, its own enterprise track. Gluecron.com, Gatetest.io, Alecrae.com (domains each own).
- Cross-sell gets bigger: every Crontech customer is a prospect for three other products. The cross-sell card I built tonight should eventually expose pricing, not just outbound links.
- Family bundle SKU: Google Workspace-style discount for customers who run all four. Phase 2 pricing experiment.

### Implications for product direction
- No product gets held back because another is not ready. Gluecron doesn't wait for Crontech. AlecRae doesn't wait for Gluecron.
- Each product has its own roadmap, its own on-call, its own compliance burden, its own business unit pressure.
- The "platform-status" contract (each product exposes `/api/platform-status` with the same shape) is the minimum integration point. Deeper integrations are opportunistic, not required.

---

## 4. AI as the compounding differentiator

Claude is not a feature. Claude is the **primary primitive** across every product:

- **Crontech** — Claude is the AI Builder, the debugger, the observability narrator, the deploy-failure fixer.
- **Gluecron** — Claude could power PR review, automated conflict resolution, release-notes generation.
- **Gatetest** — Claude already powers auto-fix on flagged code issues. Extending to visual regression triage is next.
- **AlecRae** — Claude could power Inbox Agent responses, draft suggestions, deliverability root-cause analysis.

Google / Microsoft / AWS lead with their own house models (Gemini / GPT-4 via OpenAI partnership / Bedrock menu). Crontech and siblings lead with Claude — which is, at time of writing (April 2026), the most capable reasoning model on the market. **This is a real, defensible technical differentiator that every marketing surface should mention**, but only obliquely ("Powered by Claude, the most capable AI on the market"), not aggressively ("Claude beats Gemini") until the fortress is built.

---

## What this appendix does NOT overwrite

- Read `STRATEGY.md` for the canonical mission, moat, positioning, pricing philosophy, launch sequence, AlecRae spec, what-not-to-claim.
- Read `BUILD_PLAN.md` for the locked 3-phase plan with explicit Phase 1.5 parking lot.
- Read `LAUNCH_CHECKLIST.md` for the step-by-step go-live sequence.
- Read `PROGRESS_LOG.md` for daily shipped-blocked-next structure.

Each doc has one purpose. Don't conflate them. When in doubt, append a dated appendix, don't rewrite.

Last updated: 2026-04-22 (late evening).
