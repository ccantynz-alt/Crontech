// ── /docs/api-reference/support — Support procedure reference ─────
//
// Documents the `support.*` router as it ships today, split between
// public / authenticated submission and the admin ticketing surface.
// Procedure names pulled from apps/api/src/trpc/procedures/support.ts.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function SupportReference(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference — Support"
        description="tRPC support router: public + authenticated ticket submission, admin triage, AI draft approval, and stats. Routes into the real inbound-email pipeline."
        path="/docs/api-reference/support"
      />

      <DocsArticle
        eyebrow="API Reference · Support"
        title="Support procedures"
        subtitle="The support.* router is the one piece of the stack that spans every permission level. Anyone can file a ticket. Authenticated users get their account context attached automatically. Admins see a queue with AI-drafted replies they can approve, edit, or override."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "Back to the API Reference index",
          href: "/docs/api-reference",
          description:
            "Every other router in the app, grouped by subsystem.",
        }}
      >
        <p>
          A previous iteration of the support page faked a submission
          — the form dispatched a <code>setTimeout</code> success
          toast and nothing ever reached anyone. The current router
          routes every submission through the real inbound-email
          pipeline, the same pipeline that handles{" "}
          <code>support@crontech.ai</code> email, so a prospect who
          fills the form gets the same treatment as a prospect who
          emails the address directly.
        </p>

        <h2>Submission (two flavours)</h2>

        <h3><code>support.submitPublic</code></h3>
        <p>
          Public <em>mutation</em>. Input:
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
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  category: CategoryEnum,
  message: z.string().trim().min(10).max(10_000),
})`}</code>
        </pre>
        <p>
          The <code>from</code> address is derived from the submitted{" "}
          <code>email</code> field (not a session). The subject is
          auto-built from the first 60 characters of the message plus
          the category prefix. Returns{" "}
          <code>{`{ ticketId, action }`}</code>.
        </p>

        <h3><code>support.submitRequest</code></h3>
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
  category: CategoryEnum,
  subject: z.string().min(2).max(200),
  body: z.string().min(5).max(10_000),
})`}</code>
        </pre>
        <p>
          Same pipeline as public submission, but the <code>from</code>{" "}
          address comes from the session's user row. No need for the
          caller to re-type their email.
        </p>

        <Callout tone="info" title="Category enum">
          Both submission procedures share a single category enum —
          billing, account, bug, feature, security, other. The admin
          UI uses the category to auto-assign tickets to the right
          queue.
        </Callout>

        <h2>Admin triage</h2>

        <Callout tone="warn">
          Every procedure below is admin-gated. An unauthenticated or
          non-admin caller receives <code>UNAUTHORIZED</code>.
        </Callout>

        <h3><code>support.listTickets</code></h3>
        <p>
          Admin <em>query</em>. Input carries pagination + filter
          params (<code>status</code>, <code>category</code>,{" "}
          <code>search</code>). Returns a page of tickets with their
          latest message, assignment, and AI-draft status.
        </p>

        <h3><code>support.getTicket</code></h3>
        <p>
          Admin <em>query</em>. Input{" "}
          <code>{`{ id: string }`}</code>. Returns the full ticket —
          every message, attachments, assignment history, and the
          current AI-drafted reply (if any).
        </p>

        <h3><code>support.approveDraft</code></h3>
        <p>
          Admin <em>mutation</em>. Input{" "}
          <code>{`{ ticketId: string }`}</code>. The agent has read the
          AI-drafted reply and green-lit it as-is. The draft is sent
          as an email, appended to the ticket thread, and the status
          advances accordingly.
        </p>

        <h3><code>support.editAndSend</code></h3>
        <p>
          Admin <em>mutation</em>. Input{" "}
          <code>{`{ ticketId: string, body: string }`}</code>. The
          agent has rewritten (or fully replaced) the AI draft. The
          edited body is the canonical reply — sent, threaded, logged.
        </p>

        <h3><code>support.updateStatus</code></h3>
        <p>
          Admin <em>mutation</em>. Input{" "}
          <code>{`{ id: string, status: StatusEnum }`}</code>. Status
          values are <code>open</code>, <code>pending</code>,{" "}
          <code>resolved</code>, <code>closed</code>.
        </p>

        <h3><code>support.getStats</code></h3>
        <p>
          Admin <em>query</em>. No input. Returns the dashboard
          stats — open ticket count, average response time, backlog by
          category, AI-draft acceptance rate.
        </p>

        <h2>Worked example — submit a ticket from a marketing page</h2>
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
          <code>{`const { ticketId, action } = await trpc.support.submitPublic.mutate({
  name: "Dana Rivers",
  email: "dana@example.com",
  category: "bug",
  message: "The custom-domain flow shows a verified badge before the DNS TXT propagates.",
});

// action is one of "created" | "merged" | "routed" — exposed for the
// thank-you page so we can say "we merged your report into an
// existing thread" when appropriate.`}</code>
        </pre>

        <h2>Related</h2>
        <KeyList
          items={[
            {
              term: "email.*",
              description:
                "The outbound-email client support.* calls when AI drafts are approved or edits are sent.",
            },
            {
              term: "admin.*",
              description:
                "Broader admin-console procedures — user management, credit issuance, feature-flag targeting.",
            },
            {
              term: "audit.*",
              description:
                "Every admin mutation above is audited. See audit.* for the read side of the audit trail.",
            },
          ]}
        />

        <Callout tone="note">
          The <code>processInboundEmail</code> helper is shared
          between this router and the real inbound SMTP pipeline, so
          every ticket — whether it came from a logged-in dashboard
          submission, a public marketing-page form, or a direct email
          — lands in the same queue with the same shape.
        </Callout>
      </DocsArticle>
    </>
  );
}
