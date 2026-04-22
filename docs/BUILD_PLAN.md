# Crontech Build Plan — LOCKED

**Purpose:** kill scope creep. Anything not on this plan does not get built. Additions require a new phase, not a mid-phase insertion.

**Locked:** 2026-04-22. Any further edits require a dated amendment at the bottom, not in-place rewrites.

---

## Phase 1 — Fortress Foundation (ship within 7 days)

**Outcome:** Craig can show an attorney, show an accountant, and take a real payment from a real customer.

### Code (Claude-assisted, already mostly done this session)
- [x] Signup + email verification (efc49f4)
- [x] Stripe price IDs + missing-price gate (e4cbf4c, e61d3a2)
- [x] Pricing per-plan CTAs + /checkout route (5e46035, 17962142)
- [x] Deploy pipeline — "Live" means live (3b23346, a586292)
- [x] Non-dev paste-a-URL tile (d96054b)
- [x] AlecRae client + webhook receiver (ecb87be, 3fcb60e, 8cd16493)
- [x] Landing page every-business positioning (31335df)
- [x] /solutions verticals page (167b182)
- [x] /wordpress marketing page (07eef5b)
- [x] 5 real Getting Started docs articles (6591f82)

### Code (remaining, small)
- [ ] **Landing page tone-down to stealth** — remove aggressive "replaces X" framing, keep it professional and low-signal. 30 min via MCP.
- [ ] **Legal docs stubs** — `docs/legal/PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`, `COOKIE_POLICY.md`, `DPA.md`. Placeholder-grade — attorney fills in. 30 min via MCP.
- [ ] **Footer legal links** — nav footer with Privacy / ToS / Cookie / Contact + copyright + trademark placeholder. 15 min via MCP.

### Gated on Craig (no code can unblock these)
- [ ] **Provision AlecRae** — tenant, 10 templates, `mail.crontech.ai` DNS. 40-60 min.
- [ ] **Provision Stripe** — create live Pro + Enterprise prices, create webhook endpoint, flip `STRIPE_ENABLED=true` in Vercel. 20-30 min.
- [ ] **Incorporate the company** — LLC or Ltd depending on jurisdiction. Hand files to accountant.
- [ ] **Trademark filings** — Crontech, Gluecron, Gatetest, AlecRae. Start with attorney.
- [ ] **Orchestrator decision**: stand up on a $10/mo Hetzner/Fly.io box, OR launch with deploy-queue communicated upfront, OR punt deploys entirely for week one. See LAUNCH_CHECKLIST.md §orchestrator.
- [ ] **First-invoice test** — one paying customer (a friend, family member, throwaway card) through the full funnel. Proves Stripe + AlecRae actually work end-to-end before any real marketing.

**Exit criteria for Phase 1:**
1. A real payment has cleared.
2. Attorney has reviewed (not finalised — reviewed) the legal stubs.
3. AlecRae + Stripe + orchestrator-or-decision are all green.
4. Crontech.ai + Gluecron.com + Gatetest.io + Alecrae.com are all publicly reachable (even if quietly).

---

## Phase 2 — Fortress Walls (weeks 2-4, quietly)

**Outcome:** legal and compliance moat exists. You can defend the company if a competitor notices.

### Legal + compliance
- [ ] Trademark filings progressed to "published for opposition" stage
- [ ] Attorney-finalised Privacy Policy, ToS, Cookie Policy, DPA (not stubs)
- [ ] SOC 2 Type II audit engaged — Drata or Vanta. Stealth onboarding, no public announcement.
- [ ] GDPR compliance documentation trail
- [ ] CCPA compliance documentation trail
- [ ] Cookie consent banner live on crontech.ai + all sibling products
- [ ] IP assignment agreements for anyone who has touched Crontech / Gluecron / Gatetest / AlecRae code (including Craig himself → the company)
- [ ] Company bank account, clean books handed to accountant monthly

### Customer acquisition (stealth)
- [ ] First 10-25 paying customers by invitation
- [ ] No Product Hunt, no Hacker News, no paid ads, no Twitter launch
- [ ] Every paying customer signs a beta agreement with attorney-reviewed terms

### Product
- [ ] Self-healing deploys (Gatetest auto-fix extended to deploy failures)
- [ ] AlecRae-on-Crontech shadow deploy (self-dogfood proof point)
- [ ] Email events table + suppression list updates from AlecRae webhook
- [ ] Deploy pipeline has real async status streaming (not just synchronous call)

**Exit criteria for Phase 2:**
1. 10+ paying customers, all billed successfully through Stripe for 2+ months.
2. SOC 2 Type II readiness gap assessment complete (even if audit isn't done).
3. Attorney-approved legal docs live on the site.
4. Bank account + accountant + books in order.
5. At least one of AlecRae, Gluecron, Gatetest running on Crontech's own infrastructure.

---

## Phase 3 — Go Loud (weeks 5+, once fortress is real)

**Outcome:** Crontech can safely be noticed by Vercel, Cloudflare, Google, Microsoft without existential risk.

### Public launch
- [ ] Landing page rewrites: lead with "Claude-native platform that replaces Cloudflare + Render + Vercel + Mailgun + Twilio"
- [ ] Comparison pages — `/vs-vercel`, `/vs-cloudflare`, `/vs-supabase`, `/vs-github` (for Gluecron)
- [ ] Product Hunt launch
- [ ] Hacker News "Show HN" post
- [ ] Twitter / X launch thread
- [ ] YouTube demo video (Claude builds a pizzeria website in 3 minutes)
- [ ] Press outreach: TechCrunch, The Information, Bloomberg, Stratechery

### Product
- [ ] AI Builder preview on the landing page itself (v0.dev-style inline demo)
- [ ] Full PaaS lane visible: "bring your own GitHub repo" as an equal citizen
- [ ] Prod observability in English feature
- [ ] Weekly business insights email feature

### Growth
- [ ] Paid acquisition (Google, LinkedIn, X) for the SMB audience
- [ ] Partner program for agencies (white-label)
- [ ] WordPress plugin live in WordPress.org directory
- [ ] Marketplace of third-party AI agents running on Crontech

**Exit criteria for Phase 3:**
1. 1,000+ paying customers.
2. First major press mention without getting squashed.
3. ARR reaches a level where the hyperscaler acquisition offer is declined from a position of strength.

---

## The unbendable rule

**No feature or doc can be added to Phase 1 without removing an equivalent one.** Phase 1 is locked. If something feels urgent, write it down in a "Phase 1.5 parking lot" at the bottom of this doc and move on.

### Phase 1.5 parking lot (not in scope, don't build)
- Revenue-share pricing tier (3% until first $1,000)
- AlecRae as fourth card in PlatformSiblingsWidget
- Live AI demo on landing page
- Cross-cloud arbitrage
- Voice deploy ("hey Crontech, ship my latest commit")
- /vs-vercel page (scheduled for Phase 3)

---

## Amendment log

- 2026-04-22 initial lock by Craig. Scope frozen at Phase 1 list above. All Phase 1.5 parking lot items require Phase 2 entry or later.
