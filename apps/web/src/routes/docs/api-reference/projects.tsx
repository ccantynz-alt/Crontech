// ── /docs/api-reference/projects — Projects procedure reference ────
//
// Documents the `projects.*` router as it actually ships today, using
// procedure names + input shapes pulled from
// apps/api/src/trpc/procedures/projects.ts.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function ProjectsReference(): JSX.Element {
  return (
    <>
      <SEOHead
        title="API Reference — Projects"
        description="tRPC projects router: CRUD, custom domains, env vars, and deployments. Ownership-checked on every mutation."
        path="/docs/api-reference/projects"
      />

      <DocsArticle
        eyebrow="API Reference · Projects"
        title="Projects procedures"
        subtitle="The projects.* router is where most of the dashboard's traffic lands. CRUD, custom-domain wiring, env-var management, and deploy triggering — all ownership-checked before any row gets touched."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "Billing procedures",
          href: "/docs/api-reference/billing",
          description:
            "Once projects exist, billing.* decides whether the user can ship more of them.",
        }}
      >
        <p>
          Every procedure below is protected — the caller must have a
          live session. The handler verifies project ownership against{" "}
          <code>ctx.userId</code> before touching any row, so attempting
          to act on another user's project returns{" "}
          <code>NOT_FOUND</code> rather than leaking existence.
        </p>

        <Callout tone="info" title="One project row, many side tables">
          A project has associated rows in <code>projectDomains</code>,{" "}
          <code>projectEnvVars</code>, and <code>deployments</code>. The
          delete procedure cascades these. The CRUD procedures below
          only touch the <code>projects</code> table unless otherwise
          noted.
        </Callout>

        <h2>Read</h2>

        <h3><code>projects.list</code></h3>
        <p>
          Protected <em>query</em>. No input. Returns every project
          owned by <code>ctx.userId</code>, most recently updated first.
          Used by the dashboard's project picker.
        </p>

        <h3><code>projects.getById</code></h3>
        <p>
          Protected <em>query</em>. Input{" "}
          <code>{`{ id: string }`}</code>. Returns the project row plus
          its domains and the last few deployments. Throws{" "}
          <code>NOT_FOUND</code> if the caller doesn't own the project.
        </p>

        <h2>Write</h2>

        <h3><code>projects.create</code></h3>
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
  name: z.string().min(1).max(120),
  framework: z.string().optional(),
  description: z.string().optional(),
})`}</code>
        </pre>
        <p>
          The slug is derived from the name via an internal{" "}
          <code>slugify()</code> + uniqueness check. Pass a name with
          at least one alphanumeric character or the handler rejects
          with <code>BAD_REQUEST</code>. Returns the new project row.
        </p>

        <h3><code>projects.update</code></h3>
        <p>
          Protected <em>mutation</em>. Input accepts{" "}
          <code>id</code> plus any subset of{" "}
          <code>{`{ name, description, framework }`}</code>. Ownership
          checked before applying the diff.
        </p>

        <h3><code>projects.delete</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ id: string }`}</code>. Cascades domain + env-var
          rows and tears down any live deployments. Irreversible.
        </p>

        <h2>Custom domains</h2>

        <h3><code>projects.addDomain</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ projectId, hostname }`}</code>. Registers a
          customer-supplied hostname against the project. Does not
          verify DNS — call <code>verifyDomain</code> once the{" "}
          <code>A</code> record is pointed at the expected Crontech IP.
        </p>

        <h3><code>projects.verifyDomain</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ projectId, hostname }`}</code>. Runs a DNS lookup
          (<code>resolve4</code>) against the hostname, compares
          against the platform's expected <code>A</code> record, and
          flips the domain's <code>verified</code> flag on match.
        </p>

        <h3><code>projects.removeDomain</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ projectId, hostname }`}</code>. Detaches the
          hostname from the project. The DNS zone itself — if you
          bought the domain through Crontech — is untouched.
        </p>

        <h2>Environment variables</h2>

        <h3><code>projects.listEnvVars</code></h3>
        <p>
          Protected <em>query</em>. Input{" "}
          <code>{`{ projectId: string }`}</code>. Returns every env-var
          key + value for the project. Values are stored encrypted at
          rest and decrypted only for the owner.
        </p>

        <h3><code>projects.setEnvVar</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ projectId, key, value, scope? }`}</code>.{" "}
          Upserts — the key is unique per project per scope. Values
          are encrypted before hitting the DB.
        </p>

        <h3><code>projects.deleteEnvVar</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ projectId, key, scope? }`}</code>. Removes the row.
        </p>

        <h2>Deploy</h2>

        <h3><code>projects.deploy</code></h3>
        <p>
          Protected <em>mutation</em>. Input{" "}
          <code>{`{ projectId: string }`}</code>. Kicks off a build +
          deploy cycle, writes a new row to <code>deployments</code>,
          and returns the deployment id so the caller can subscribe to
          its status via the <code>deployments.*</code> router.
        </p>

        <Callout tone="note">
          The deploy procedure returns as soon as the build is queued,
          not when it completes. Stream progress from{" "}
          <code>deployments.getStatus</code> or the real-time{" "}
          <code>data-change</code> channel.
        </Callout>

        <h2>Worked example — create, configure, ship</h2>
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
          <code>{`const { id } = await trpc.projects.create.mutate({
  name: "my-app",
  framework: "solid-start",
});

await trpc.projects.setEnvVar.mutate({
  projectId: id,
  key: "ANTHROPIC_API_KEY",
  value: myKey,
});

await trpc.projects.addDomain.mutate({
  projectId: id,
  hostname: "app.example.com",
});

const deploy = await trpc.projects.deploy.mutate({ projectId: id });
// deploy.deploymentId is now streaming through deployments.*`}</code>
        </pre>

        <h2>Related routers</h2>
        <KeyList
          items={[
            {
              term: "deployments.*",
              description:
                "Once deploy is called, watch progress here: list, getById, getStatus, cancel.",
            },
            {
              term: "dns.*",
              description:
                "Admin-only DNS zone + record management. See the DNS & Domains article.",
            },
            {
              term: "import.*",
              description:
                "The importProject router handles one-shot imports from an existing git repo or another host. Out of scope for this article.",
            },
          ]}
        />
      </DocsArticle>
    </>
  );
}
