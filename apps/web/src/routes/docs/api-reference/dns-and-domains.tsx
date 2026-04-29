// ── /docs/api-reference/dns-and-domains — DNS & Domains reference ──
//
// Documents three related routers: dns.*, domains.*, and
// domainSearch.*. Procedure names + input shapes are pulled from
// apps/api/src/trpc/procedures/{dns,domains,domain-search}.ts.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import { Callout, DocsArticle, KeyList } from "../../../components/docs/DocsArticle";

export default function DnsAndDomainsReference(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference — DNS & Domains"
        description="tRPC dns, domains, and domainSearch routers: zone + record management, availability search, registration, per-user domain roll-up."
        path="/docs/api-reference/dns-and-domains"
      />

      <DocsArticle
        eyebrow="API Reference · DNS & Domains"
        title="DNS & Domains procedures"
        subtitle="Three related routers cover the domain lifecycle: domainSearch.* for availability, domains.* for registration and pricing, and dns.* for managing records on any zone you control."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "AI & Chat procedures",
          href: "/docs/api-reference/ai-and-chat",
          description: "AI site builder, chat conversations, and per-user provider BYOK.",
        }}
      >
        <p>
          Domain-related functionality lives in three routers because they have different
          authorisation boundaries. <code>domainSearch.*</code> and parts of <code>domains.*</code>{" "}
          are public (anyone can check availability). <code>dns.*</code> is admin-only because zone
          and record management carries blast-radius beyond any single user.
        </p>

        <h2>domainSearch.* — public availability checks</h2>

        <h3>
          <code>domainSearch.search</code>
        </h3>
        <p>
          Public <em>query</em>. Input:
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
  query: z.string().min(1),
  tlds: z.array(z.string()).optional(),
  includeTrademark: z.boolean().optional(),
  includeAiSuggestions: z.boolean().optional(),
})`}</code>
        </pre>
        <p>
          Returns only the <em>available</em> names, taken/unknown counts, optional AI-suggested
          alternatives, and optional trademark warnings (medium + high risk only). Cached —{" "}
          <code>result.cached</code> tells you whether the response was served from the cache.
        </p>

        <h2>domains.* — register + manage</h2>

        <h3>
          <code>domains.search</code>
        </h3>
        <p>
          Public <em>query</em>. Same shape as <code>domainSearch.search</code> but against the
          underlying OpenSRS lookup. Returns an <code>AvailabilityResult[]</code> for every
          requested TLD (including ones that failed). Use <code>domainSearch.search</code> if you
          want the AI + trademark layer on top.
        </p>

        <h3>
          <code>domains.getPricing</code>
        </h3>
        <p>
          Public <em>query</em>. Input <code>{"{ domain: string, years?: number }"}</code>. Returns
          wholesale + retail price (in micro-dollars), markup percent, and currency. Years defaults
          to 1.
        </p>

        <h3>
          <code>domains.register</code>
        </h3>
        <p>
          Admin <em>mutation</em>. Registers a domain on behalf of a user. Input carries the domain,
          contact details, and the <code>userId</code> the domain will be assigned to. Admin- only
          because the request charges the platform's OpenSRS account — a user-facing "buy this
          domain" flow is a separate piece of work that wraps this procedure with an escrow step.
        </p>

        <h3>
          <code>domains.renew</code>
        </h3>
        <p>
          Admin <em>mutation</em>. Input <code>{"{ domain: string, years: number }"}</code>. Extends
          the registration via OpenSRS.
        </p>

        <h3>
          <code>domains.listMyDomains</code>
        </h3>
        <p>
          Protected <em>query</em>. No input. Returns every domain registered to the current user,
          including expiry dates and nameserver state.
        </p>

        <h2>dns.* — zones + records (admin-only)</h2>

        <Callout tone="warn" title="Admin-only router">
          Every procedure on <code>dns.*</code> is admin-gated. A rogue user cannot enumerate zones,
          flip nameservers, or create records — attempting to call these without the admin role
          returns <code>UNAUTHORIZED</code>.
        </Callout>

        <h3>Zones</h3>
        <KeyList
          items={[
            {
              term: "dns.listZones",
              description: "Admin query. No input. Returns every zone managed by the platform.",
            },
            {
              term: "dns.getZone",
              description:
                "Admin query. Input { id | name }. Returns zone metadata + nameserver state.",
            },
            {
              term: "dns.createZone",
              description:
                "Admin mutation. Input { name, type }. Provisions the zone on the upstream provider and writes a local shadow row.",
            },
            {
              term: "dns.updateZone",
              description: "Admin mutation. Patches zone-level settings (TTL defaults, DNSSEC).",
            },
            {
              term: "dns.deleteZone",
              description:
                "Admin mutation. Input { id }. Tears down the zone on the provider and deletes every associated record row. Destructive.",
            },
          ]}
        />

        <h3>Records</h3>
        <KeyList
          items={[
            {
              term: "dns.listRecords",
              description: "Admin query. Input { zoneId }. Returns every record in the zone.",
            },
            {
              term: "dns.getRecord",
              description: "Admin query. Input { id }. Returns a single record row.",
            },
            {
              term: "dns.createRecord",
              description:
                "Admin mutation. Input { zoneId, type, name, content, ttl?, priority? }. Validates the type against SUPPORTED_TYPES before writing.",
            },
            {
              term: "dns.updateRecord",
              description: "Admin mutation. Input { id, ...patch }. Partial update on any record.",
            },
            {
              term: "dns.deleteRecord",
              description: "Admin mutation. Input { id }. Removes the record upstream and locally.",
            },
            {
              term: "dns.bulkImport",
              description:
                "Admin mutation. Bulk-imports a zone's records from a BIND-style payload. Used during migration flows.",
            },
            {
              term: "dns.supportedTypes",
              description:
                "Admin query. No input. Returns the list of record types the router accepts (A, AAAA, CNAME, MX, TXT, SRV, CAA, etc).",
            },
          ]}
        />

        <h2>Worked example — availability, pricing, registration</h2>
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
          <code>{`// 1. Public search (no session required)
const { available } = await trpc.domainSearch.search.query({
  query: "my-cool-app",
  tlds: [".com", ".ai", ".dev"],
  includeTrademark: true,
});

// 2. Public price lookup for the winner
const price = await trpc.domains.getPricing.query({
  domain: "my-cool-app.ai",
  years: 1,
});

// 3. Admin-only registration (ops call, wrapped by the dashboard UI)
const registered = await trpc.domains.register.mutate({
  domain: "my-cool-app.ai",
  years: 1,
  userId: ownerId,
  /* contact details... */
});`}</code>
        </pre>

        <Callout tone="note">
          <strong>What's not here yet:</strong> a user-facing "buy this domain" procedure that wraps{" "}
          <code>domains.register</code> with Stripe escrow. That ships as part of the billing
          go-live — until then, registration is an ops action.
        </Callout>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "projects.addDomain",
              description:
                "Once a domain exists (however you got it), attach it to a project via projects.*. See the Projects article.",
            },
            {
              term: "dnsImport.*",
              description:
                "One-shot importer that pulls an existing zone from another DNS provider. Admin-only.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
