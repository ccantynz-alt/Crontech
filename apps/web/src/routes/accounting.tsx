import type { JSX } from "solid-js";
import { For } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

interface Feature {
  title: string;
  description: string;
  badge: string;
}

const features: Feature[] = [
  {
    badge: "AI",
    title: "AI Invoice Processing",
    description:
      "Drop a PDF. Watch line items, totals, tax codes, and vendor info populate themselves. Trained on millions of real invoices — accuracy that matches a human bookkeeper.",
  },
  {
    badge: "Portal",
    title: "Client Portal",
    description:
      "Every client gets a secure, branded portal. They upload receipts, view statements, approve invoices, and pay you — without ever sending an email.",
  },
  {
    badge: "Tax",
    title: "Real-Time Tax Calculations",
    description:
      "Multi-jurisdiction VAT, GST, sales tax, and HST. Updated in real time as rules change. Federal, state, and local — all handled automatically.",
  },
  {
    badge: "Compliance",
    title: "Compliance Dashboard",
    description:
      "SOC 2 Type II, GDPR, HIPAA-ready. Hash-chained audit trails. Every change tracked. Every export defensible. Built for the moment a regulator asks.",
  },
  {
    badge: "Reports",
    title: "Financial Reports",
    description:
      "P&L, Balance Sheet, Cash Flow, Tax Summary — generated in milliseconds. Drill down to any transaction. Export to PDF, CSV, or directly into your filing software.",
  },
  {
    badge: "Sync",
    title: "Integrations",
    description:
      "Two-way sync with Xero, QuickBooks, Stripe, and 12,000+ banks. Migrate in under an hour. Import a decade of history without losing a single decimal.",
  },
];

interface Stat {
  value: string;
  label: string;
}

const stats: Stat[] = [
  { value: "90%", label: "Faster invoice processing" },
  { value: "$0", label: "Per-client database cost" },
  { value: "SOC 2", label: "Type II audit trail built in" },
];

interface Testimonial {
  quote: string;
  name: string;
  title: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "We replaced three tools and cut our month-end close from 11 days to 2. Our partners stopped asking for status updates because they could just look.",
    name: "Sarah Chen, CPA",
    title: "Managing Partner, Chen & Associates",
  },
  {
    quote:
      "The AI invoice processing alone paid for the platform in the first week. I haven't manually entered a line item in months.",
    name: "Marcus Whitfield",
    title: "Senior Controller, Whitfield Tax Group",
  },
  {
    quote:
      "I have audit-ready compliance documentation on demand. When the IRS came knocking, I exported a hash-verified trail in under a minute.",
    name: "Priya Anand, EA",
    title: "Founder, Anand Bookkeeping",
  },
];

interface Tier {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

const tiers: Tier[] = [
  {
    name: "Solo",
    price: "$29",
    description: "For independent CPAs and bookkeepers.",
    features: [
      "Up to 25 clients",
      "Unlimited invoices",
      "AI invoice processing",
      "Standard reports",
    ],
    cta: "Start Free Trial",
  },
  {
    name: "Practice",
    price: "$99",
    description: "For growing accounting firms.",
    features: [
      "Up to 200 clients",
      "Client portals",
      "Multi-jurisdiction tax",
      "Custom reports",
      "Priority support",
    ],
    cta: "Start Free Trial",
    featured: true,
  },
  {
    name: "Firm",
    price: "Custom",
    description: "For multi-partner firms and enterprises.",
    features: [
      "Unlimited clients",
      "SSO + SCIM",
      "SOC 2 audit pack",
      "Dedicated success manager",
      "Custom integrations",
    ],
    cta: "Contact Sales",
  },
];

export default function AccountingLanding(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Marco Reid Accounting — AI Platform for Accountants"
        description="The AI accounting platform accountants actually want to use. Cut 80% of manual work with AI invoice processing, real-time tax calculations, and SOC 2 audit trails built in."
        path="/accounting"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        {/* Hero */}
        <Stack direction="vertical" gap="md" align="center">
          <Badge variant="info" size="md">
            For Accountants & Accounting Firms
          </Badge>
          <Text variant="h1" weight="bold" align="center">
            The AI accounting platform accountants actually want to use.
          </Text>
          <Text variant="body" class="text-muted" align="center">
            Cut 80% of manual work. Reconcile in seconds, not days. Built by
            people who have closed real books — for people who close them every
            month.
          </Text>
          <Stack direction="horizontal" gap="sm">
            <A href="/register">
              <Button variant="primary" size="lg">
                Start Free Trial
              </Button>
            </A>
            <A href="/accounting/dashboard">
              <Button variant="outline" size="lg">
                See Live Demo
              </Button>
            </A>
          </Stack>
        </Stack>

        {/* Stats */}
        <div class="stats-grid">
          <For each={stats}>
            {(stat) => (
              <Card padding="md">
                <Stack direction="vertical" gap="xs" align="center">
                  <Text variant="h2" weight="bold">
                    {stat.value}
                  </Text>
                  <Text variant="caption" class="text-muted">
                    {stat.label}
                  </Text>
                </Stack>
              </Card>
            )}
          </For>
        </div>

        {/* Features */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h2" weight="semibold" align="center">
            Everything a modern firm needs. Nothing it doesn't.
          </Text>
          <div class="grid-3">
            <For each={features}>
              {(f) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="sm">
                    <Badge variant="info" size="sm">
                      {f.badge}
                    </Badge>
                    <Text variant="h4" weight="semibold">
                      {f.title}
                    </Text>
                    <Text variant="body" class="text-muted">
                      {f.description}
                    </Text>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* Testimonials */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h2" weight="semibold" align="center">
            Trusted by firms that bill by the hour.
          </Text>
          <div class="grid-3">
            <For each={testimonials}>
              {(t) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="sm">
                    <Text variant="body">"{t.quote}"</Text>
                    <Text variant="caption" weight="semibold">
                      {t.name}
                    </Text>
                    <Text variant="caption" class="text-muted">
                      {t.title}
                    </Text>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* Pricing */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h2" weight="semibold" align="center">
            Pricing built for the way firms actually grow.
          </Text>
          <div class="grid-3">
            <For each={tiers}>
              {(tier) => (
                <Card padding="lg">
                  <Stack direction="vertical" gap="sm">
                    <Stack direction="horizontal" justify="between" align="center">
                      <Text variant="h3" weight="bold">
                        {tier.name}
                      </Text>
                      {tier.featured ? (
                        <Badge variant="success" size="sm">
                          Most Popular
                        </Badge>
                      ) : null}
                    </Stack>
                    <Text variant="h2" weight="bold">
                      {tier.price}
                      <Text variant="caption" class="text-muted">
                        {" "}/ month
                      </Text>
                    </Text>
                    <Text variant="caption" class="text-muted">
                      {tier.description}
                    </Text>
                    <For each={tier.features}>
                      {(feat) => <Text variant="body">✓ {feat}</Text>}
                    </For>
                    <A href="/register">
                      <Button
                        variant={tier.featured ? "primary" : "outline"}
                        size="lg"
                      >
                        {tier.cta}
                      </Button>
                    </A>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* CTA Footer */}
        <Card padding="lg">
          <Stack direction="vertical" gap="sm" align="center">
            <Text variant="h2" weight="bold" align="center">
              Start your 30-day trial. No credit card required.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Onboard your firm in under an hour. Migrate clients with one
              click. Cancel anytime.
            </Text>
            <A href="/register">
              <Button variant="primary" size="lg">
                Start Free Trial
              </Button>
            </A>
            <Stack direction="horizontal" gap="sm" justify="center">
              <Badge variant="success" size="sm">
                SOC 2 Type II
              </Badge>
              <Badge variant="success" size="sm">
                GDPR Compliant
              </Badge>
              <Badge variant="success" size="sm">
                HIPAA-Ready
              </Badge>
              <Badge variant="success" size="sm">
                256-bit Encryption
              </Badge>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
