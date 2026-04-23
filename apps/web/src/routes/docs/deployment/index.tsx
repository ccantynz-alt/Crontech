// ── /docs/deployment — Category overview ────────────────────────────
//
// Landing article for the Deployment category. Sets expectations for
// how deploys actually run on Crontech today (webhook → sandboxed build
// → Wrangler deploy → live URL) and points users at the three follow-
// on articles in the category. Honest about the current single-worker
// queue and the dashboard-driven flow (no public CLI yet).

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function DeploymentOverviewArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Deployment"
        description="How Crontech turns a commit into a live edge URL. Sandboxed builds, automatic Wrangler deploys, env vars, custom domains, and what's queued next."
        path="/docs/deployment"
      />

      <DocsArticle
        eyebrow="Deployment"
        title="Deployment"
        subtitle="Every Crontech deploy runs the same pipeline: a webhook arrives, the repo clones into an isolated workspace, the build runs inside a locked-down sandbox, and the artefact ships to the edge. This is the map of how all of it fits together."
        readTime="4 min"
        updated="April 2026"
        nextStep={{
          label: "How a deploy actually runs",
          href: "/docs/deployment/how-a-deploy-runs",
          description:
            "Step-by-step walkthrough of the pipeline from git push to live URL, with honest notes on what is wired and what is queued.",
        }}
      >
        <p>
          The Deployment category is where you go when you want to
          understand what the platform is doing on your behalf between
          the moment you push a commit and the moment visitors start
          hitting the new version. It is also where the levers live —
          environment variables, custom domains, preview environments —
          and where the promises the platform makes about isolation and
          rollback are written down.
        </p>

        <h2>How deploys work on Crontech, in one paragraph</h2>
        <p>
          A deploy is triggered by a GitHub webhook (production on push
          to the default branch, preview on every pull request) or by
          clicking <strong>Deploy</strong> on the project page. The
          build runner clones your repo into an isolated workspace,
          runs <code>bun install</code> and your build command inside a
          locked-down Docker sandbox, then hands the artefact to the
          orchestrator which publishes it to Cloudflare Workers behind
          the project's <code>*.crontech.app</code> URL (and any custom
          domains you've wired up). Every deploy is recorded, every log
          line is streamed live into the dashboard, and every
          deployment is one click away from a rollback.
        </p>

        <Callout tone="info">
          There is no public CLI yet — every flow in this category is
          dashboard-driven. The webhook, build runner, sandbox, and
          orchestrator pieces are all shipped and run the real pipeline
          for every deploy today.
        </Callout>

        <h2>What's in this category</h2>

        <KeyList
          items={[
            {
              term: "How a deploy actually runs",
              description:
                "End-to-end walkthrough: webhook → clone → sandboxed install and build → orchestrator hand-off → live URL. Covers log streaming, timeouts, and what success and failure look like on the deployments page.",
            },
            {
              term: "Environment variables",
              description:
                "How to set env vars per project, how secrets are stored and masked, how they flow into the sandboxed build, and how preview vs production scoping works.",
            },
            {
              term: "Custom domains",
              description:
                "Advanced cases beyond the Getting Started article: apex vs subdomain nuances, running multiple domains per project, primary-domain redirects, and delegating a full DNS zone.",
            },
          ]}
        />

        <h2>The guarantees the platform makes</h2>

        <KeyList
          items={[
            {
              term: "Workspace isolation",
              description:
                "Every build gets its own temporary workspace at /tmp/crontech-build/<deploymentId>. The directory is wiped on both success and failure — one build can never see another's working files.",
            },
            {
              term: "Sandboxed customer code",
              description:
                "bun install and your build command run inside a Docker container with cap-drop=ALL, no-new-privileges, a read-only root filesystem, a non-root uid, bridged network only, 2 GB memory, 1 CPU, and a 512-pid cap. Postinstall hooks and build scripts cannot escape the container.",
            },
            {
              term: "Hard wall-clock timeout",
              description:
                "A single deploy is capped at 10 minutes end-to-end. If a build exceeds the budget, the child process is killed and the deployment is marked failed — never left hanging.",
            },
            {
              term: "Streamed logs",
              description:
                "stdout and stderr are forwarded line-by-line into the deployment log table as the build runs. You see logs in the dashboard as they happen, not after the fact.",
            },
            {
              term: "Automatic secret scrubbing",
              description:
                "Log lines matching *_KEY / *_SECRET / *_TOKEN / *_PASSWORD, Bearer tokens, and PEM blocks are replaced with KEY=*** before they are persisted. A leaked secret in a build log is not a class of bug that can exist on this platform.",
            },
            {
              term: "One-click rollback",
              description:
                "Every past deployment has a Promote to production button. Clicking it flips traffic back to the previously-built artefact in under a second — no rebuild required.",
            },
          ]}
        />

        <Callout tone="note">
          Build concurrency on the primary worker is serial today — the
          queue drains one deployment at a time so a runaway{" "}
          <code>bun install</code> can't starve the rest of the box.
          The queue is in-process; a multi-worker distributed lock is
          on the roadmap but is not required for single-node
          deployments.
        </Callout>

        <h2>Where to go next</h2>
        <p>
          If you are setting up a new project, start with the Getting
          Started series:{" "}
          <a href="/docs/getting-started/new-project">
            Create your first project
          </a>{" "}
          and{" "}
          <a href="/docs/getting-started/connect-github">
            Connect a GitHub repository
          </a>
          . Once you have a deploy running, come back here to master
          the pipeline, wire up env vars, and point real domains at the
          project.
        </p>
      </DocsArticle>
    </>
  );
}
