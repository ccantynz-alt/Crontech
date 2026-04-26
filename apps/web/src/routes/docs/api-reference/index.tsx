// ── /docs/api-reference — API Reference index ──────────────────────
//
// The overview page for the API Reference category. Enumerates every
// tRPC sub-router that ships on `appRouter` today and points each one
// at its own per-router article. Descriptions are written from the
// actual procedure list in `apps/api/src/trpc/procedures/*` — no
// aspirational surface area, no made-up verbs.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function ApiReferenceIndex(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference"
        description="Every tRPC router in Crontech, grouped by subsystem. Auth, projects, billing, DNS, domains, AI, chat, and support — procedure names drawn from the live router."
        path="/docs/api-reference"
      />

      <DocsArticle
        eyebrow="API Reference"
        title="API Reference"
        subtitle="Every tRPC router that ships today, grouped by subsystem. Each section links to a dedicated article with the real procedure names, input shapes, and the current live-vs-coming-soon status."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "Auth procedures",
          href: "/docs/api-reference/auth",
          description:
            "Passkeys, Google OAuth, email + password, CSRF, and session lifecycle.",
        }}
      >
        <p>
          Crontech is one tRPC app. Every request from the dashboard,
          the CLI, or a customer-built client lands on a single{" "}
          <code>appRouter</code> mounted at <code>/trpc/*</code>. Each
          subsystem lives under its own namespace (<code>auth.*</code>,{" "}
          <code>projects.*</code>, <code>ai.siteBuilder.*</code>, and so
          on), so you only import the slices you need and the TypeScript
          compiler enforces the shape end-to-end.
        </p>

        <p>
          This page is the table of contents. Each link below goes to a
          dedicated article that lists the live procedures, their Zod
          input schemas, and whether the path is fully shipped or still
          gated behind a feature flag.
        </p>

        <Callout tone="info" title="How to read these articles">
          Every procedure referenced in this category is grepable in{" "}
          <code>apps/api/src/trpc/procedures/</code>. If an article lists
          a procedure that isn't there, that's a doc bug — file it and
          we'll fix it within the day.
        </Callout>

        <h2>How the tRPC app is organised</h2>
        <p>
          The router surface is grouped into seven families. Anything
          not in this list is either internal plumbing (health probe,
          CSRF token) or still behind a launch flag:
        </p>

        <KeyList
          items={[
            {
              term: "Auth",
              description:
                "Passkey register / login, Google OAuth, email + password, session management, CSRF. All three paths land the same user in the same place.",
            },
            {
              term: "Projects",
              description:
                "Create, list, update, and delete projects. Attach custom domains. Manage env vars. Trigger deployments. Ownership-checked on every mutation.",
            },
            {
              term: "Billing",
              description:
                "Stripe checkout and customer-portal sessions, plan catalogue, subscription status, metered-usage reporting. ENV-gated pre-launch — see the article for how the UI handles that.",
            },
            {
              term: "DNS & Domains",
              description:
                "DNS zones and records (admin-only), domain availability search, domain registration via OpenSRS, per-user domain roll-up.",
            },
            {
              term: "AI & Chat",
              description:
                "AI site-builder generate / save / version, conversation CRUD, per-user provider BYOK, usage stats. Three-tier compute routing picks client / edge / cloud per call.",
            },
            {
              term: "Support",
              description:
                "Public and authenticated ticket submission that pipes into the real inbound-email pipeline. Admin ticket triage + stats dashboard.",
            },
          ]}
        />

        <h2>Calling the API from the browser</h2>
        <p>
          The web app uses a typed tRPC client generated directly from{" "}
          <code>AppRouter</code>. A call looks like this — the procedure
          path, the input object, and the inferred return type all come
          from the server:
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
          <code>{`import { trpc } from "~/trpc/client";

// Read: list the current user's projects
const projects = await trpc.projects.list.query();

// Write: create a new project (CSRF + session required)
const created = await trpc.projects.create.mutate({
  name: "my-app",
  framework: "solid-start",
});`}</code>
        </pre>

        <p>
          There is no REST surface to mirror. tRPC speaks JSON over HTTP
          under the hood and the browser client handles the wire
          format for you. If you need to integrate from a language that
          doesn't have a tRPC client, every procedure is reachable as
          a plain POST to <code>/trpc/&lt;path&gt;</code> — the input
          goes in <code>{`{"json": ...}`}</code> and the output comes
          back the same way.
        </p>

        <h2>Authentication model</h2>
        <p>
          Procedures are one of three kinds:
        </p>
        <KeyList
          items={[
            {
              term: "publicProcedure",
              description:
                "No session required. Mutations still require a valid CSRF token. Used for sign-up, login, billing status probe, domain search.",
            },
            {
              term: "protectedProcedure",
              description:
                "Session cookie must be present and valid. The handler receives ctx.userId. Used for anything user-scoped — projects, chat, deployments.",
            },
            {
              term: "adminProcedure",
              description:
                "Session must belong to a user with the admin role. Used for DNS zone management, domain registration, support ticket triage, and usage reporting.",
            },
          ]}
        />

        <Callout tone="note">
          CSRF tokens are fetched via{" "}
          <code>auth.csrfToken</code> and sent back on every mutation.
          The token is bound to the session and rotates on login — you
          do not need to store it long-term.
        </Callout>

        <h2>Where to go next</h2>
        <p>
          Start with auth, then projects — that covers the full sign-up
          to first-deploy path. The AI and support articles are useful
          when you're wiring a customer-facing product on top of the
          platform rather than hosting your own.
        </p>

        <KeyList
          items={[
            {
              term: "/docs/api-reference/auth",
              description:
                "Passkey register / login, Google OAuth, email + password, checkPasswordStrength, me.",
            },
            {
              term: "/docs/api-reference/projects",
              description:
                "list, getById, create, update, delete, addDomain, env vars, deploy.",
            },
            {
              term: "/docs/api-reference/billing",
              description:
                "getStatus, joinWaitlist, getPlans, getSubscription, createCheckoutSession, createPortalSession, reportUsage.",
            },
            {
              term: "/docs/api-reference/dns-and-domains",
              description:
                "DNS zones + records, domainSearch.search, domains.search / getPricing / register / listMyDomains.",
            },
            {
              term: "/docs/api-reference/ai-and-chat",
              description:
                "ai.siteBuilder.generate / save / listSites, chat.createConversation / saveMessage / provider keys.",
            },
            {
              term: "/docs/api-reference/support",
              description:
                "submitPublic + submitRequest, admin listTickets / getTicket / updateStatus / getStats.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
