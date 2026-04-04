# Legal Protection Blueprint — Back to the Future Platform

> **FOR ATTORNEY REVIEW — NOT LEGAL ADVICE**
> This document compiles research findings for review by qualified legal counsel
> in New Zealand, Australia, United States, and United Kingdom. All recommendations
> must be validated by licensed attorneys in each jurisdiction before implementation.

---

## PART 1: MULTI-JURISDICTION CORPORATE STRUCTURE (NZ/AU/US/UK)

### 1.1 Recommended Holding Structure

```
                    ┌─────────────────────────┐
                    │   PARENT HOLDING CO      │
                    │   Delaware C-Corp (US)    │
                    │                           │
                    │  • VC investment vehicle   │
                    │  • US customer contracts   │
                    │  • US employees            │
                    │  • QSBS-eligible stock     │
                    └─────────┬─────────────────┘
                              │ 100% owns all subsidiaries
            ┌─────────────────┼─────────────────┐
            │                 │                   │
   ┌────────▼──────┐  ┌──────▼────────┐  ┌──────▼────────┐
   │  NZ Ltd       │  │  AU Pty Ltd   │  │  UK Ltd       │
   │  (Subsidiary) │  │  (Subsidiary) │  │  (Subsidiary) │
   │               │  │               │  │               │
   │ • R&D center  │  │ • AU sales &  │  │ • UK/EU sales │
   │ • Core eng    │  │   support     │  │   & support   │
   │ • IP holder   │  │ • AU customer │  │ • UK customer │
   │   (licensed   │  │   contracts   │  │   contracts   │
   │   to parent)  │  │ • Claims AU   │  │ • Claims UK   │
   │ • Claims NZ   │  │   R&D offset  │  │   RDEC        │
   │   RDTI (15%)  │  │   (43.5%)     │  │ • UK data     │
   │               │  │               │  │   residency   │
   └───────────────┘  └───────────────┘  └───────────────┘
```

**Why this structure:**
- Delaware C-Corp satisfies US VCs, enables QSBS ($10M capital gains exclusion)
- NZ Ltd holds IP where R&D happens. NZ has no capital gains tax, 15% RDTI
- Royalty flows NZ→US at 10% WHT (treaty rate)
- AU and UK subs isolate liability per-jurisdiction
- US lawsuit cannot reach NZ/AU/UK assets (separate entities)

**Precedents:** Atlassian (AU→Delaware flip pre-IPO), Xero (NZ-listed, kept NZ parent), Rocket Lab (NZ→Delaware SPAC), Canva (stayed AU Pty Ltd through $40B+ valuation)

**Phased rollout:**
1. Day 1: NZ Ltd (NZ$150, 1-2 days)
2. Pre-Series A: Delaware C-Corp ($500 via Stripe Atlas or $2K with attorney)
3. AU headcount reaches 5: AU Pty Ltd ($2,500)
4. UK headcount reaches 3-5: UK Ltd (£500)

### 1.2 Per-Country Entity Details

| Country | Entity | Formation | R&D Credit | Key Compliance |
|---------|--------|-----------|------------|----------------|
| **NZ** | Ltd | NZ$150 + ~$1,500 legal, 1-2 days | RDTI 15% (min $50K spend) | Privacy Act 2020, IPP 3A (May 2026), Consumer Guarantees Act |
| **AU** | Pty Ltd | AU$576 + ~$2,000 legal, 2-5 days | 43.5% refundable (<$20M rev) | Privacy Act 1988, ACL, Modern Slavery Act (>$100M AUD) |
| **US** | Delaware C-Corp | ~$400 state + $1.5-3K legal, 1-3 days | Section 41 (up to 20%) | State-by-state privacy, Section 230, AI state laws |
| **UK** | Private Ltd | £12 + ~£500 legal, 1 day | RDEC 20% | UK GDPR, Consumer Rights Act 2015, IR35, DMCCA 2024 |

### 1.3 Tax Treaty Network

| Route | Dividend WHT | Royalty WHT | Interest WHT |
|-------|-------------|-------------|--------------|
| NZ → US | 15% (5% if 10%+ ownership) | 10% | 10% |
| NZ → AU | 15% (0% with conditions) | 5% | 10% |
| NZ → UK | 15% | 10% | 10% |
| AU → US | 15% (5% if 10%+ ownership) | 5% | 10% |

### 1.4 Employee Share Schemes

- **NZ:** ESS regime. Taxed at exercise on discount. No capital gains tax (major advantage).
- **AU:** ESS with tax deferral (up to 15 years). Startup concession (<$50M turnover).
- **US:** ISOs (up to $100K/yr), NSOs for contractors. 83(b) election critical for founders.
- **UK:** EMI options (very tax-efficient, CGT at 10%). £250K per employee cap.

### 1.5 Estimated Annual Structuring Costs

| Item | Cost |
|------|------|
| Transfer pricing documentation | $10-20K/yr |
| Multi-jurisdiction tax compliance | $30-50K/yr |
| D&O insurance (all entities) | $15-25K/yr |
| Registered agents | $1-2K/yr |
| Legal maintenance | $5-10K/yr |
| **Total** | **$61-107K/yr** |

---

## PART 2: AI PLATFORM LIABILITY

### 2.1 EU AI Act (Fully Applicable August 2, 2026)

- AI website/video builder likely **"limited risk"** (transparency obligations)
- GPAI model provider obligations already in effect (August 2025)
- Fines: up to EUR 35M / 7% global turnover for prohibited practices
- **ACTION:** Conduct AI Act risk classification by June 2026. Appoint EU representative.

### 2.2 US State AI Laws

| State | Law | Effective | Key Requirement |
|-------|-----|-----------|-----------------|
| Colorado | AI Act | June 30, 2026 | Reasonable care against algorithmic discrimination |
| Texas | TRAIGA | Jan 1, 2026 | Bans deepfakes/CSAM, disclosure requirements |
| California | AB 316 | Jan 1, 2026 | Cannot use "AI autonomy" as liability defense |

**Federal preemption is NOT reliable.** Comply with all state laws where you have users.

### 2.3 FTC Enforcement

The FTC targets AI washing, privacy violations, fake reviews, deceptive outputs. An AI-generated output that misleads a reasonable consumer is actionable.
- **Never overstate AI capabilities in marketing**
- **Clearly label all AI-generated content**

---

## PART 3: TERMS OF SERVICE

### 3.1 Key Clauses (Modeled on OpenAI/Anthropic)

**Liability Cap:** 12 months of fees paid (enterprise), $500 fixed cap (free/consumer).

**AI Output Disclaimer:** "AI-generated outputs are provided as-is. Users are responsible for reviewing, verifying, and taking responsibility for all AI-generated content before use, publication, or deployment."

**Mandatory Arbitration + Class Action Waiver:** Enforceable under Federal Arbitration Act. Include 30-day opt-out window to improve enforceability.

**Indemnification:** Users indemnify platform for: (a) breach of terms, (b) user content, (c) applications built on platform, (d) end-user claims from deployed sites.

**IP Ownership:** Users own their inputs and outputs. Platform retains no training rights on user data without explicit consent.

**AI Copyright Disclosure:** "AI-generated content may not be eligible for copyright protection. Users should add meaningful human creative input to AI outputs to strengthen copyright claims." (Per Thaler v. Perlmutter — cert denied March 2026)

### 3.2 Acceptable Use Policy

Prohibit: illegal content, deepfakes, CSAM, malware, spam, copyright infringement, content that violates third-party rights, automated scraping/abuse, circumventing rate limits.

---

## PART 4: SECTION 230 AND DMCA

### 4.1 Section 230

**Section 230 likely does NOT protect AI-generated content.** The Third Circuit's Anderson v. TikTok (2025) held algorithmic curation can be the platform's own "expressive activity." AI output is arguably the platform's own content, not third-party content.

**Treat all AI output as if you bear liability.**

### 4.2 DMCA Safe Harbor

**IMMEDIATE ACTIONS:**
1. Register DMCA designated agent with US Copyright Office
2. Implement takedown/counter-notice procedure
3. Maintain repeat infringer termination policy
4. Add content filters to prevent reproducing copyrighted works
5. Document procedures and make publicly accessible

---

## PART 5: GLOBAL PRIVACY COMPLIANCE

| Jurisdiction | Key Law | AI-Specific | Deadline |
|---|---|---|---|
| EU | GDPR | DPIAs for AI, Art. 22 right to explanation | Ongoing |
| UK | UK GDPR + Data Use Act | ICO enforcement active | Ongoing |
| NZ | Privacy Act 2020 + Amendment 2025 | IPP 3A: PIAs for AI, human oversight | May 1, 2026 |
| AU | Privacy Act 1988 | Automated decision transparency | Dec 10, 2026 |
| US | CCPA/CPRA | Right to opt out of automated decisions | Jan 1, 2026 |

**Client-side AI inference (WebGPU) is a privacy advantage.** Data does not leave the device. Document this in your DPA.

**ACTIONS:**
1. Appoint Data Protection Officer
2. Conduct DPIAs for all AI processing
3. Implement data residency controls (EU data in EU, NZ in NZ/AU)
4. Prepare DPAs with Standard Contractual Clauses
5. Implement granular consent management

---

## PART 6: INSURANCE

Major carriers filed broad AI exclusions in late 2025. You need AI-specific coverage.

| Policy | Purpose | Minimum Coverage |
|--------|---------|-----------------|
| Cyber Liability | Data breaches, ransomware | $2-5M |
| E&O (Professional Liability) | AI output errors, service failures | $2-5M |
| D&O | Director/officer liability | $2-5M |
| General Commercial | Bodily injury, property damage | $1-2M |
| Media/IP Liability | Copyright, trademark, defamation | $1-2M |

**AI-Specific Insurers:** Armilla (Lloyd's-backed), Testudo (launched Jan 2026, covers generative AI litigation), AXA/Coalition AI endorsements.

---

## PART 7: EMPLOYEE IP PROTECTION

### 7.1 Agreements Required

1. **CIIAA (Confidential Information and Invention Assignment Agreement):** All employees/contractors sign at onboarding. Assigns ALL work product IP.
2. **NDA:** Covers proprietary technology, business plans, customer data, AI model architectures.
3. **Non-Solicitation:** Prevents poaching colleagues and customers after departure.
4. **Trade Secret Designation:** Mark all proprietary materials. Implement access controls. Log access.

### 7.2 Non-Compete Status

- **FTC Rule:** Blocked by court (Aug 2024). Not in effect. Do NOT rely on non-competes.
- **NZ:** Enforceable if reasonable (max ~12 months)
- **AU:** Enforceable if reasonable. Use cascading clauses (12/6/3 months)
- **UK:** Enforceable if reasonable (6-12 months). Garden leave common.
- **US California:** Completely unenforceable.

**Strategy:** Rely on trade secrets + NDAs + non-solicits, NOT non-competes.

---

## PART 8: CORPORATE VEIL PROTECTION

**Mandatory practices to prevent piercing:**
1. Separate bank accounts for each entity — never commingle
2. Hold annual board meetings with minutes
3. Adequate capitalization at formation
4. Separate insurance policies per entity
5. Arm's-length intercompany transactions with documented agreements
6. Independent management — subsidiaries have operational autonomy
7. Separate books, payroll, tax filings per entity
8. File annual reports, maintain good standing everywhere

---

## PART 9: CONTRACT TEMPLATES NEEDED BEFORE LAUNCH

### Legally Required (Cannot Launch Without)

| Document | Why |
|----------|-----|
| Terms of Service / EULA | Governs user relationship |
| Privacy Policy | Required by GDPR, CCPA, NZ Privacy Act, AU Privacy Act |
| Cookie/Tracking Policy | Required by GDPR/ePrivacy |
| DPA (Data Processing Agreement) | Required by GDPR for B2B customers |
| DMCA Policy | Required for DMCA safe harbor |
| AUP (Acceptable Use Policy) | Limits liability for AI-generated content |

### Commercially Required (Enterprise Will Demand)

| Document | Why |
|----------|-----|
| MSA (Master Service Agreement) | Enterprise contract structure |
| SLA (Service Level Agreement) | 99.5-99.9% uptime commitments |
| SOC 2 Type II Report | Enterprise buyers require it (6-12 month process) |
| Subprocessor List | GDPR disclosure requirement |
| AI Addendum | Model rights, output ownership, accuracy disclaimers |

### Employee/Contractor Agreements

| Document | Per-Country Notes |
|----------|-------------------|
| CIIAA | Adapt for NZ/AU/US/UK employment law |
| NDA | Enforceable in all 4 jurisdictions |
| Non-Solicitation | Enforceable in all 4 jurisdictions |
| Offer Letter | Country-specific employment terms |
| Contractor Agreement | IP assignment, work-for-hire, IR35 (UK) |
| Equity Agreement | ISO (US), EMI (UK), ESS (AU), ESS (NZ) |

---

## PART 10: EMERGING THREATS (2026 WATCH LIST)

1. **NYT v. OpenAI** — Proceeding to trial. Could reshape AI training data rights. Monitor closely.
2. **AI Hallucination Liability** — 600+ documented cases. Never present AI output as factual without disclaimer.
3. **California AB 316** — Cannot use "the AI did it" as defense. You are liable. Period.
4. **Content Authenticity** — Deepfake legislation proliferating. Implement C2PA content credentials for AI-generated video/images.
5. **Model Weight Privacy** — Regulators questioning if deleting user data from DB is sufficient if it's in model weights. Build "model unlearning" capability.
6. **State AI Bills** — Multiple 2026 bills creating private rights of action against AI developers.

---

## PRIORITY ACTIONS (FIRST 90 DAYS)

| # | Action | Timeline |
|---|--------|----------|
| 1 | Engage SaaS-specialized counsel in US, UK, NZ, AU | Week 1 |
| 2 | Form NZ Ltd (if not already done) | Week 1 |
| 3 | Draft ToS, Privacy Policy, AUP, DMCA Policy, DPA, Cookie Policy | Weeks 2-4 |
| 4 | Register DMCA designated agent with US Copyright Office | Week 2 |
| 5 | Implement CIIAAs for all team members | Week 2 |
| 6 | Procure insurance with explicit AI coverage | Weeks 3-4 |
| 7 | Classify AI systems under EU AI Act risk tiers | Month 2 |
| 8 | Begin SOC 2 Type II audit process | Month 2 |
| 9 | Conduct Privacy Impact Assessments | Month 2 |
| 10 | Implement content provenance (C2PA) for AI video/images | Month 3 |
| 11 | Delaware C-Corp formation (at or before Series A) | When fundraising |
| 12 | AU Pty Ltd formation | When AU headcount reaches 5 |
| 13 | UK Ltd formation | When UK headcount reaches 3-5 |

---

## SOURCES

- EU AI Act 2026 Updates — legalnodes.com, orrick.com, dlapiper.com
- US State AI Laws — kslaw.com (King & Spalding), bakerbotts.com
- OpenAI/Anthropic ToS — openai.com/policies, tostracker.app
- Section 230 & AI — Congress.gov (CRS LSB11097), CDT, Harvard Law Review
- Thaler v. Perlmutter — Skadden, Holland & Knight
- NYT v. OpenAI — NPR, Reuters
- Getty v. Stability AI — Latham & Watkins
- NZ Privacy Amendment 2025 — securiti.ai
- Insurance AI Exclusions — insurancebusinessmag.com, techlifefuture.com
- FTC Non-Compete Rule — ftc.gov
- Corporate Veil — Wolters Kluwer, Gouchev Law
- SaaS Contracts — promise.legal, toslawyer.com
- 2026 AI Legal Forecast — Baker Donelson, Wiley

---

> **This document is a starting point for your attorneys, not a finished legal product.**
> Every clause, every structure, every policy must be reviewed and customized by
> qualified counsel in each jurisdiction before implementation.
