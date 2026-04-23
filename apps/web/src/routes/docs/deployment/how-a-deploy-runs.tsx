// ── /docs/deployment/how-a-deploy-runs ───────────────────────────────
//
// End-to-end walkthrough of the real BLK-009 build pipeline: webhook
// intake, deployment-record creation, queue entry, workspace
// preparation, shallow git clone on the host, sandboxed install and
// build, orchestrator hand-off, DNS upsert, and finalisation to live.
// Describes behaviour that is actually implemented today — no
// invented CLI commands. Honest about the single-node queue and
// what's pending.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function HowADeployRunsArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="How a deploy actually runs"
        description="The full Crontech deploy pipeline: webhook → clone → sandboxed install and build → orchestrator hand-off → live URL. Honest walkthrough of what's wired today and what's queued next."
        path="/docs/deployment/how-a-deploy-runs"
      />

      <DocsArticle
        eyebrow="Deployment"
        title="How a deploy actually runs"
        subtitle="From the moment a webhook lands to the moment traffic cuts over, every Crontech deploy runs the same seven stages. This is the map of each stage, what it guarantees, and where the observability hooks live."
        readTime="5 min"
        updated="April 2026"
        nextStep={{
          label: "Environment variables",
          href: "/docs/deployment/environment-variables",
          description:
            "Now that you know what the pipeline does, wire up the env vars it reads from during the build and serves at runtime.",
        }}
      >
        <p>
          A Crontech deploy is not a magic black box. The pipeline has
          seven numbered stages, each of which writes a structured log
          line as it starts. If you are ever looking at a stuck
          deployment, the log stream on the deployments page tells you
          exactly which stage the system is on.
        </p>

        <h2>Stage 1 — Trigger</h2>
        <p>
          A deploy starts one of three ways:
        </p>

        <KeyList
          items={[
            {
              term: "GitHub push webhook",
              description:
                "A push to the project's default branch triggers a production deploy. The GitHub App forwards the webhook to the API, which validates the signature and creates a new deployment row in status queued.",
            },
            {
              term: "GitHub pull request webhook",
              description:
                "Opening, reopening, or pushing to a PR creates a preview deployment scoped to that branch. The preview gets its own *.crontech.app subdomain and is torn down when the PR is closed.",
            },
            {
              term: "Manual deploy from the dashboard",
              description:
                "The Deploy button on the project page calls the same internal handler as the webhook. Useful for re-running a failed deploy, or deploying a branch that isn't auto-wired.",
            },
          ]}
        />

        <p>
          Whichever trigger fired, the result is the same: a row in the{" "}
          <code>deployments</code> table with a fresh UUID, a commit
          SHA, a branch name, and a status of <code>queued</code>. The
          deployment id is then handed to the build runner's in-process
          queue.
        </p>

        <Callout tone="note">
          The queue drains serially on a single worker today. A second
          deploy for the same project waits behind the first. If the
          same deployment id is somehow enqueued twice, an in-memory
          concurrency guard rejects the duplicate before any work
          starts.
        </Callout>

        <h2>Stage 2 — Workspace preparation</h2>
        <p>
          The runner starts by transitioning the deployment to{" "}
          <code>building</code>, stamping <code>startedAt</code>, and
          writing a{" "}
          <code>[build-runner] starting build</code> event log. Then it
          prepares an isolated workspace.
        </p>

        <Steps>
          <li>
            The path <code>/tmp/crontech-build/&lt;deploymentId&gt;</code>{" "}
            is wiped (in case a previous interrupted build left
            remnants) and re-created empty.
          </li>
          <li>
            The deployment id is validated against a strict allow-list
            before it touches the filesystem. A malformed id (anything
            outside <code>[a-zA-Z0-9_.-]</code>, or longer than 64
            chars) is rejected before any path resolution runs.
          </li>
          <li>
            The resolved workspace path is verified to live inside the
            sandbox root. This defends against{" "}
            <code>../</code> path-injection attempts from upstream.
          </li>
        </Steps>

        <h2>Stage 3 — Shallow git clone</h2>
        <p>
          The runner runs{" "}
          <code>git clone --depth 1 --branch &lt;branch&gt;</code>{" "}
          directly on the host into the workspace directory. This is
          the one and only stage where code from your repository is
          fetched without the sandbox — git clone over TLS does not
          execute customer code, so it's safe to run on the host, and
          running it outside the sandbox lets the next stages mount the
          cloned tree cleanly.
        </p>

        <Callout tone="info">
          <code>--depth 1</code> keeps the clone cheap even for repos
          with long histories. If your build genuinely needs the full
          history (for example, a build-time version stamp derived from{" "}
          <code>git describe</code>), open an issue — we are tracking
          a per-project override.
        </Callout>

        <h2>Stage 4 — Sandboxed install</h2>
        <p>
          This is the stage where your code first has a chance to
          execute (npm postinstall scripts, native module build steps,
          the usual). The runner never executes any of it on the host.{" "}
          <code>bun install --frozen-lockfile</code> runs inside a
          locked-down Docker container:
        </p>

        <KeyList
          items={[
            {
              term: "Capability lockdown",
              description:
                "--cap-drop=ALL and --security-opt=no-new-privileges. Suid binaries cannot escalate. Kernel capabilities are zero.",
            },
            {
              term: "Filesystem lockdown",
              description:
                "--read-only root filesystem with small writable tmpfs scratch at /tmp and /run. The only writable volume is the bind-mounted workspace itself.",
            },
            {
              term: "Non-root inside container",
              description:
                "Container runs as uid 1000. Even if a chain of CVEs lands root inside the container, it is not root on the host.",
            },
            {
              term: "Resource caps",
              description:
                "2 GB memory, 1 CPU, 512 pids, 4096 file descriptors. Runaway builds hit a ceiling instead of taking down the node.",
            },
            {
              term: "Network: bridge only",
              description:
                "Outbound HTTPS works so registries resolve, but the container cannot reach the host's internal services. --network=host is never used.",
            },
          ]}
        />

        <p>
          Every stdout and stderr line from inside the container is
          captured, scrubbed for secret-shaped patterns, and written
          into <code>deployment_logs</code> as it arrives. You see the
          lines in the dashboard stream before the install finishes.
        </p>

        <h2>Stage 5 — Sandboxed build</h2>
        <p>
          The build command runs inside the same sandbox profile with{" "}
          <code>NODE_ENV=production</code> set. By default this is{" "}
          <code>bun run build</code>; if your project defined a custom
          build command in the deploy wizard, the runner splits it on
          whitespace and uses that instead.
        </p>
        <p>
          The sandbox runner carries a wall-clock timeout equal to the
          remaining budget from the 10-minute whole-deploy cap. If
          either <code>bun install</code> or the build runs long, the
          container is killed with <code>SIGKILL</code> and the deploy
          fails with a clear "exceeded timeout" event log — it is
          never left to drift.
        </p>

        <Callout tone="warn">
          The sandbox requires Docker on the build host. The
          orchestrator box ships with it pre-installed; if you ever
          self-host the runner elsewhere, the runner will fail loudly
          on the first sandboxed step rather than silently falling
          back to host execution.
        </Callout>

        <h2>Stage 6 — Orchestrator hand-off</h2>
        <p>
          A successful build transitions the deployment to{" "}
          <code>deploying</code> and hands off to the orchestrator via
          an HTTP call. The orchestrator takes the built artefact,
          publishes it to Cloudflare Workers using Wrangler, runs a
          health check, and returns the container id and health status.
        </p>
        <p>
          In the same stage, the runner upserts the DNS A record for{" "}
          <code>&lt;slug&gt;.crontech.ai</code>. DNS is a best-effort
          step — if the upsert fails, the deploy still succeeds (the
          platform's wildcard record already covers the default case),
          and the failure is captured as an event log so operators can
          follow up.
        </p>

        <h2>Stage 7 — Finalisation</h2>
        <p>
          Once the orchestrator reports healthy, the runner does the
          clean-up pass in one transaction:
        </p>

        <Steps>
          <li>
            Every previous live deployment for the project is flipped
            to <code>isCurrent: false</code> (in a single update
            statement, before the new row is marked current — otherwise
            the filter would match the row we just wrote).
          </li>
          <li>
            The new deployment is transitioned to <code>live</code>,
            with <code>deployUrl</code>, <code>buildDuration</code>,
            total <code>duration</code>, <code>completedAt</code>, and{" "}
            <code>isCurrent: true</code> all set.
          </li>
          <li>
            A row is written into <code>build_minutes_usage</code> for
            metered billing. This is best-effort — a failure here never
            marks the deploy failed; the usage reporter reconciles
            later.
          </li>
          <li>
            A final event log is written:{" "}
            <code>[build-runner] deployment live at &lt;url&gt;</code>.
          </li>
        </Steps>

        <h2>What failure looks like</h2>
        <p>
          Every stage can fail. When one does, the runner catches the
          error, writes a{" "}
          <code>[build-runner] FAILED: &lt;message&gt;</code> event
          log, transitions the deployment to <code>failed</code>,
          records the error message on the row, and runs the workspace
          cleanup. The failing stage's last stdout/stderr lines are
          still in the log stream, so you can diagnose without
          re-running.
        </p>

        <KeyList
          items={[
            {
              term: "Clone failed",
              description:
                "Usually a bad branch name, a revoked GitHub App install, or a private repo without the App connected. The git stderr tells you which.",
            },
            {
              term: "Install failed",
              description:
                "bun install non-zero exit. The log stream shows the failing package and the underlying error. Out-of-memory kills (common on monorepos with heavy node_modules) surface as a SIGKILL line.",
            },
            {
              term: "Build failed",
              description:
                "Your build command returned non-zero. Typos, type errors, missing env vars at build time — same signal as running bun run build locally, just captured in the log stream.",
            },
            {
              term: "Deploy failed",
              description:
                "Orchestrator returned an error or the health check didn't pass. Less common; usually a missing runtime env var or a Wrangler config the orchestrator couldn't reconcile.",
            },
            {
              term: "Timeout",
              description:
                "The 10-minute whole-deploy cap expired. The error message reads 'build exceeded 600000ms timeout' and the log stream ends on whichever stage was live when the timer fired.",
            },
          ]}
        />

        <h2>Observability hooks</h2>

        <KeyList
          items={[
            {
              term: "deployments table",
              description:
                "Source of truth for every deploy: status, durations, commit SHA, branch, deploy URL, error message. The dashboard's deployments page is a thin projection of this table.",
            },
            {
              term: "deployment_logs table",
              description:
                "Append-only stream of every stdout / stderr / event line the runner emitted. Rows are ordered by timestamp and stream, so you can replay any historical deploy.",
            },
            {
              term: "OpenTelemetry spans",
              description:
                "Every stage emits a span with the deployment id as a tag. Grafana's Tempo instance is where you go when you want to see the pipeline laid out as a flamegraph across stages.",
            },
          ]}
        />

        <h2>You know the pipeline.</h2>
        <p>
          The next two articles in this category cover the two levers
          you'll reach for most often: environment variables and
          custom domains. After that, the{" "}
          <a href="/docs/getting-started/connect-github">
            Connect GitHub
          </a>{" "}
          article is still your reference for the repository side of
          the wiring.
        </p>
      </DocsArticle>
    </>
  );
}
