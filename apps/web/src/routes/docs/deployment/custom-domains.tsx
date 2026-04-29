// ── /docs/deployment/custom-domains ─────────────────────────────────
//
// Advanced domain topics that go beyond the single-domain happy path
// covered in /docs/getting-started/custom-domain. Covers apex-vs-
// subdomain record choice, multiple domains per project with primary
// selection and redirect behaviour, wildcards and per-tenant
// subdomains, and delegating a full DNS zone to Crontech name
// servers.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import { Callout, DocsArticle, KeyList, Steps } from "../../../components/docs/DocsArticle";

export default function CustomDomainsArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Custom domains"
        description="Advanced custom-domain topics on Crontech: apex vs subdomain, running multiple domains per project, primary-domain redirects, wildcards, and delegating a full DNS zone."
        path="/docs/deployment/custom-domains"
      />

      <DocsArticle
        eyebrow="Deployment"
        title="Custom domains"
        subtitle="The Getting Started article covers wiring a single hostname. This one covers everything around the edges: apex records, multi-domain projects, redirects, wildcards, and full-zone delegation."
        readTime="4 min"
        updated="April 2026"
      >
        <p>
          If you haven't wired your first domain yet, start at{" "}
          <a href="/docs/getting-started/custom-domain">Wire a custom domain</a> in the Getting
          Started series. That article walks the happy path: add a hostname, create a CNAME, wait
          for SSL, done. This article picks up from there and covers the cases the happy-path
          walkthrough doesn't.
        </p>

        <h2>Apex domains: CNAME flattening, ALIAS, or A records</h2>
        <p>
          A bare apex (<code>your-domain.com</code>, no <code>www.</code>) cannot take a traditional
          CNAME record — the DNS spec forbids a CNAME coexisting with the <code>SOA</code> and{" "}
          <code>NS</code> records that every apex must carry. Every DNS provider that supports apex
          aliasing works around this in one of three ways, and Crontech supports all three.
        </p>

        <KeyList
          items={[
            {
              term: "CNAME flattening (Cloudflare)",
              description:
                "Add the record as if it were a normal CNAME pointing at cname.crontech.app. Cloudflare resolves the CNAME at serve time and returns the flattened A/AAAA answers. Zero-maintenance option — recommended whenever you already run DNS on Cloudflare.",
            },
            {
              term: "ALIAS / ANAME records",
              description:
                "Route53, DNSimple, Dreamhost, and most boutique DNS providers offer these. Functionally identical to CNAME flattening. Target is the same cname.crontech.app.",
            },
            {
              term: "A records",
              description:
                "If your DNS provider supports none of the above, the domains page surfaces a set of static A records you can paste in. This works but you're committing to the current edge IP set — if we ever rotate the anycast pool, you'll need to update the records. CNAME flattening or ALIAS is always preferred when available.",
            },
          ]}
        />

        <Callout tone="info">
          The dashboard detects which record type your provider supports from the initial lookup and
          shows you the right one on the <strong>Add domain</strong> screen. You should not have to
          decide between CNAME flattening and A records by hand.
        </Callout>

        <h2>Multiple domains per project</h2>
        <p>
          A project can have as many connected domains as your plan allows. Each one goes through
          the same add-DNS-wait-for-SSL flow, and each one gets its own managed certificate. The
          common pattern is:
        </p>

        <KeyList
          items={[
            {
              term: "An apex + a www.",
              description:
                "Connect your-domain.com and www.your-domain.com to the same project, pick one as the primary, and every request to the non-primary gets a 301 to the primary. That's how you collapse www into the apex (or vice versa) without writing any redirect code.",
            },
            {
              term: "A production domain + a staging domain",
              description:
                "Connect app.your-domain.com to the production branch and staging.your-domain.com to a persistent preview branch. Same code base, isolated env var scopes, independent SSL certificates.",
            },
            {
              term: "Rebrand windows",
              description:
                "Connect old-name.com and new-name.com to the same project. Pick new-name.com as primary so old-name.com 301-redirects, and let search engines migrate across over weeks without downtime.",
            },
          ]}
        />

        <h2>Setting the primary domain</h2>
        <p>
          Exactly one connected domain is the <strong>primary</strong>. Every other connected domain
          emits a 301 redirect to the primary with the original path preserved. The primary pill is
          settable from the <a href="/domains">Domains</a> page — click{" "}
          <strong>Make primary</strong> on any verified domain.
        </p>

        <Steps>
          <li>
            Add the domains you want to serve. All of them go through the DNS and SSL flow
            independently.
          </li>
          <li>
            On the domains page, find the one you want to be canonical and click{" "}
            <strong>Make primary</strong>.
          </li>
          <li>
            Every other connected domain flips to <strong>Redirects to primary</strong> within a
            second. The 301 is served at the edge — there is no round-trip to your worker.
          </li>
        </Steps>

        <Callout tone="note">
          The primary switch is reversible and instant. If you rebrand and need to roll back,
          re-click <strong>Make primary</strong> on the old one and the redirect direction flips
          again.
        </Callout>

        <h2>Wildcard domains and per-tenant subdomains</h2>
        <p>
          Add <code>*.your-domain.com</code> as a single connected domain and Crontech routes every
          matching subdomain to the project. This is how multi-tenant apps serve{" "}
          <code>acme.your-domain.com</code>, <code>globex.your-domain.com</code>, and a thousand
          more without re-adding each tenant.
        </p>

        <KeyList
          items={[
            {
              term: "DNS record",
              description:
                "A single CNAME at *.your-domain.com targeting cname.crontech.app. Same as any other subdomain — just with a wildcard label.",
            },
            {
              term: "SSL certificate",
              description:
                "Issued as a wildcard via DNS-01. The domains page walks you through adding the one-time _acme-challenge TXT record. Renewal uses the same record; leave it in place.",
            },
            {
              term: "Plan tier",
              description:
                "Wildcards are available on Pro and above. If you're on the Hobby plan, connect individual subdomains until you upgrade.",
            },
            {
              term: "Your routing logic",
              description:
                "Inside your Cloudflare Worker, read request.headers.get('Host') to see which tenant subdomain the request landed on and branch accordingly. The platform does not route to separate deployments per tenant — one deployment, many hostnames.",
            },
          ]}
        />

        <h2>Delegating a full DNS zone to Crontech</h2>
        <p>
          If you want Crontech to be authoritative for an entire zone — apex, every subdomain, and
          every future record — you can delegate the zone with an <code>NS</code> record change at
          your registrar. The platform then manages both the records that serve your deployments and
          any additional records you need (MX for email, TXT for verification, CAA for certificate
          pinning).
        </p>

        <Steps>
          <li>
            On the <a href="/domains">Domains</a> page, click <strong>Delegate zone</strong>. Enter
            the zone apex (for example <code>your-domain.com</code>).
          </li>
          <li>
            The dashboard returns four name servers in the form <code>nsXX.crontech.net</code>. At
            your registrar, replace the existing name servers with these four. Leave the TTL alone.
          </li>
          <li>
            Wait for the NS change to propagate — usually under an hour, sometimes up to 48
            depending on your registrar and the old NS TTL. The domains page polls and shows you
            when we start receiving queries.
          </li>
          <li>
            Once delegation is live, use the <strong>Records</strong> tab to add MX, TXT, CAA, and
            any additional A/AAAA/CNAME records you need. The records that serve your connected
            Crontech domains are auto-maintained — you don't manage those by hand.
          </li>
        </Steps>

        <Callout tone="warn">
          Delegating a live zone is a destructive change at the registrar — if you paste the new
          name servers and forget to recreate a critical record (email MX, third-party verification
          TXT), those records disappear from global DNS at cut-over. Always mirror existing
          non-Crontech records into the Records tab <em>before</em> you flip the NS records.
        </Callout>

        <h2>Removing a connected domain</h2>
        <p>
          Click <strong>Remove</strong> on any connected domain. The edge routing for that hostname
          is severed immediately and the managed certificate is revoked. Your DNS record at the
          registrar stays where it is — if you want to repoint the hostname elsewhere, do that at
          your DNS provider. If the hostname you removed was the primary, the platform picks the
          next connected domain by connection order as the new primary (and emits an event log so
          the change is visible).
        </p>

        <h2>You own the hostnames.</h2>
        <p>
          With apex, subdomains, wildcards, and full-zone delegation all supported, there is no
          hostname configuration Crontech can't serve. If you have a scenario the platform doesn't
          handle — for example, split-horizon DNS across a private network — open a{" "}
          <a href="/support">support ticket</a> and we'll scope it with you.
        </p>
      </DocsArticle>
    </>
  );
}
