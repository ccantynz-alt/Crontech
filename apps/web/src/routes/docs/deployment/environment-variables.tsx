// ── /docs/deployment/environment-variables ──────────────────────────
//
// How env vars work on Crontech: per-project scope, preview vs
// production split, secret masking, and how values flow through the
// sandbox into the build and the runtime. Honest about the
// dashboard-driven flow (no public CLI yet) and about which env vars
// the build runner injects on your behalf.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  Callout,
  DocsArticle,
  KeyList,
  ScreenshotSlot,
  Steps,
} from "../../../components/docs/DocsArticle";

export default function EnvironmentVariablesArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Environment variables"
        description="How to set environment variables per project on Crontech, how secrets are stored and masked, and how values flow through the sandboxed build into the live deployment."
        path="/docs/deployment/environment-variables"
      />

      <DocsArticle
        eyebrow="Deployment"
        title="Environment variables"
        subtitle="Every non-trivial project has a pile of API keys, database URLs, and feature flags that differ between local, preview, and production. Here's how Crontech handles each of them."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "Custom domains",
          href: "/docs/deployment/custom-domains",
          description:
            "With env vars wired up, the last piece is pointing your own domain at the deployment. Apex, subdomain, wildcard, and DNS-zone delegation covered.",
        }}
      >
        <p>
          Env vars on Crontech live in one place — the project's <strong>Settings</strong> page —
          and are scoped to two environments: <strong>preview</strong> (every PR, every branch
          deploy) and <strong>production</strong> (the default branch). You can also mark a value as
          shared across both. Every value is encrypted at rest and masked in the UI once saved.
        </p>

        <h2>Add a variable</h2>

        <Steps>
          <li>
            Open the project's <a href="/settings">Settings</a> page and scroll to the{" "}
            <strong>Environment variables</strong> section.
          </li>
          <li>
            Click <strong>Add variable</strong>, enter a key and value, and pick the scope:{" "}
            <strong>Production only</strong>, <strong>Preview only</strong>, or{" "}
            <strong>Production and preview</strong>.
          </li>
          <li>
            Save. The value is encrypted and the UI replaces it with a mask. Click the reveal icon
            to confirm what you saved — that view is audit-logged.
          </li>
        </Steps>

        <ScreenshotSlot caption="Environment variables section of the project settings page. Each row shows key, scope pill (Production / Preview / Both), masked value, last-updated timestamp, and an edit button." />

        <Callout tone="info">
          Keys are case-sensitive and restricted to <code>[A-Z0-9_]</code> by convention (the
          dashboard will let you break that, but the runtime won't). Keys that look like secrets —
          anything ending in <code>_KEY</code>, <code>_SECRET</code>, <code>_TOKEN</code>, or{" "}
          <code>_PASSWORD</code> — are automatically treated as sensitive.
        </Callout>

        <h2>How values flow through a deploy</h2>

        <KeyList
          items={[
            {
              term: "Build-time injection",
              description:
                "Env vars scoped to the matching environment (plus NODE_ENV=production for production deploys) are injected into the sandboxed build container. Your build command sees them the same way bun run build would see them locally.",
            },
            {
              term: "Runtime delivery",
              description:
                "At runtime, the same env vars are published to the Cloudflare Worker that serves your deployment. You read them with process.env.FOO inside your handlers — no separate runtime config step.",
            },
            {
              term: "Preview isolation",
              description:
                "A PR's preview deploy only sees variables scoped to Preview (or Both). Production-only keys are never sent to preview containers. Swap a staging API key in the Preview scope to keep production credentials off PR builds.",
            },
            {
              term: "Secret scrubbing",
              description:
                "Build logs are scrubbed of anything that looks like a secret (*_KEY / *_SECRET / *_TOKEN / *_PASSWORD / Bearer tokens / PEM blocks) before the log rows are persisted. A leaked token in a build log is not a class of bug that can exist on this platform.",
            },
          ]}
        />

        <h2>Variables the platform sets for you</h2>
        <p>
          A handful of env vars are populated automatically when the deploy wizard provisions
          resources for you. You don't set these — they appear in the dashboard pre-populated and
          update themselves when the underlying resource rotates.
        </p>

        <KeyList
          items={[
            {
              term: "TURSO_DATABASE_URL",
              description:
                "Set automatically if you provisioned a Turso database from the deploy wizard. Rotates if you detach and re-attach a Turso instance.",
            },
            {
              term: "TURSO_AUTH_TOKEN",
              description:
                "Paired with TURSO_DATABASE_URL. Masked in the UI. Rotated from the Turso side; the dashboard reconciles within a minute.",
            },
            {
              term: "NEON_DATABASE_URL",
              description:
                "Set if you provisioned a Neon Postgres branch from the deploy wizard. Preview deploys get a short-lived branch URL by default; production gets the main branch.",
            },
            {
              term: "QDRANT_URL / QDRANT_API_KEY",
              description:
                "Set if you attached a Qdrant collection. The API key is masked on save.",
            },
            {
              term: "NODE_ENV",
              description:
                "Always set to production for production builds. Preview builds also see NODE_ENV=production by default — if you need development mode for a preview, add NODE_ENV=development scoped to Preview only, and it takes precedence.",
            },
          ]}
        />

        <h2>Editing, rotating, and removing</h2>

        <KeyList
          items={[
            {
              term: "Editing a value",
              description:
                "Click the pencil icon on any row. The value field clears (rather than pre-filling the secret in plaintext) so you can paste a fresh credential. Save to persist.",
            },
            {
              term: "Renaming a key",
              description:
                "Not supported in place. Add a new variable with the new key, redeploy, and delete the old one. This is deliberate — a silent rename breaks builds in surprising ways.",
            },
            {
              term: "Removing a variable",
              description:
                "Click the trash icon on the row. The variable is deleted immediately and disappears from the next deploy — existing running deployments keep the old value until they're replaced by a new deploy.",
            },
            {
              term: "Rotating a secret",
              description:
                "Edit the value in place and trigger a redeploy. For zero-downtime rotation, add the new credential under a versioned key, deploy, swap the code, then remove the old key.",
            },
          ]}
        />

        <Callout tone="warn">
          Existing live deployments do NOT automatically pick up an edit. The new value lands in the
          next deploy. If you edited an env var because the old one leaked, rotate and trigger a
          deploy in the same workflow — don't rely on the edit alone.
        </Callout>

        <h2>Local development</h2>
        <p>
          The dashboard has an <strong>Export .env</strong> button on the env vars section that
          downloads a ready-to-use <code>.env</code> file for the Preview scope. Drop it at the root
          of your checkout and your local <code>bun run dev</code> sees the same values the preview
          deploy does.
        </p>
        <p>
          Don't commit the exported file. The project's <code>.gitignore</code> should already cover{" "}
          <code>.env</code>; the download flow is tagged with the timestamp and the exporting user
          in the audit log so accidental leaks are traceable.
        </p>

        <Callout tone="note">
          The export only includes Preview-scoped variables by default. Production-scoped secrets
          never leave the dashboard — they are available at runtime to the production worker and to
          the sandboxed production build, and nowhere else.
        </Callout>

        <h2>Auditing changes</h2>
        <p>
          Every add, edit, reveal, export, and delete writes an entry in the project's audit log
          with the actor, the IP, and the timestamp. The log is hash-chained so retroactive
          tampering is detectable. The audit view lives on the project's{" "}
          <a href="/settings">Settings</a> page under the audit tab.
        </p>

        <h2>You've got config.</h2>
        <p>
          With env vars wired up, every deploy — preview and production — reads the right secrets,
          the build runner injects them at the right stage, and the platform never logs them in
          plaintext. The last piece is serving the project on a domain you own — covered in the next
          article.
        </p>
      </DocsArticle>
    </>
  );
}
