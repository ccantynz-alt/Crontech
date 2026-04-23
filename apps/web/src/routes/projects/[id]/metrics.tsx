// ── Project Metrics — Early Preview ──────────────────────────────────
//
// The previous 468-line implementation generated fake CPU, memory,
// bandwidth, and requests graphs with `Math.random()` — daily cosine
// curves, gaussian spikes, simulated GC pauses, the full theatre. The
// project name was a hardcoded Record<string, string> that fell back
// to `project-${id}` for anything not in the mock list. Every chart
// number a logged-in user saw was fabricated in the browser.
//
// The real per-project metrics pipeline is the next step:
//   • OTel collector → Mimir is already wired for platform-wide metrics
//     (BLK-014 Observability is ✅ SHIPPED per HANDOFF).
//   • Per-project drill-down on `/projects/[id]/metrics` needs the
//     OTel resource attributes to carry the `projectId` and a Mimir
//     query proxied through tRPC. That's a small additional block
//     behind BLK-014 — tracked but not yet in flight.
//
// Until then this route is an honest "Coming next" page. It reads the
// real project name from tRPC instead of a hardcoded map, confirms the
// project belongs to the user (ProtectedRoute + trpc.projects.getById
// throws if not), and links out to the Grafana LGTM dashboard that
// already shows platform-wide metrics.

import { createResource, Show } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { SEOHead } from "../../../components/SEOHead";
import { trpc } from "../../../lib/trpc";

interface ProjectBasic {
  id: string;
  name: string;
}

export default function ProjectMetricsPage(): ReturnType<typeof ProtectedRoute> {
  const params = useParams<{ id: string }>();

  const [project] = createResource(
    () => params.id,
    async (id): Promise<ProjectBasic | null> => {
      try {
        const row = (await trpc.projects.getById.query({ projectId: id })) as
          | { id: string; name: string }
          | null;
        return row ? { id: row.id, name: row.name } : null;
      } catch {
        return null;
      }
    },
  );

  const displayName = (): string =>
    project()?.name ?? (params.id ? `project ${params.id}` : "this project");

  return (
    <ProtectedRoute>
      <SEOHead
        title="Metrics"
        description="Per-project metrics on Crontech — CPU, memory, bandwidth, and request graphs backed by the Crontech observability pipeline."
        path={`/projects/${params.id}/metrics`}
      />

      <div
        class="min-h-screen"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div class="mx-auto max-w-4xl px-6 py-16">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            class="mb-8 flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <A
              href="/projects"
              class="hover:underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              Projects
            </A>
            <span aria-hidden="true">/</span>
            <A
              href={`/projects/${params.id}`}
              class="hover:underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              {displayName()}
            </A>
            <span aria-hidden="true">/</span>
            <span style={{ color: "var(--color-text)" }}>Metrics</span>
          </nav>

          {/* Hero */}
          <div class="flex flex-col gap-3">
            <span
              class="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{
                background: "color-mix(in oklab, var(--color-warning) 12%, transparent)",
                color: "var(--color-warning)",
                border: "1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)",
              }}
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--color-warning)" }}
                aria-hidden="true"
              />
              Per-project metrics — coming next
            </span>
            <h1 class="text-4xl font-bold tracking-tight">
              Metrics for {displayName()}
            </h1>
            <p
              class="max-w-2xl text-base leading-relaxed"
              style={{ color: "var(--color-text-muted)" }}
            >
              The platform-wide observability stack (OpenTelemetry → Loki /
              Tempo / Mimir, visualised in Grafana) is shipped and
              collecting. Per-project drill-down graphs are the next
              increment on that pipeline — projected for the same sprint
              as BLK-014.
            </p>
            <p
              class="max-w-2xl text-sm leading-relaxed"
              style={{ color: "var(--color-text-faint)" }}
            >
              This page used to render randomly-generated CPU / memory /
              bandwidth / request charts. We pulled them rather than show
              numbers that looked real but weren't. When the real data is
              ready you'll see it here, not before.
            </p>
          </div>

          {/* Honest status table */}
          <div
            class="mt-10 overflow-hidden rounded-2xl"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <table class="w-full text-left text-sm">
              <thead>
                <tr>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Metric
                  </th>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Source
                  </th>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    { metric: "CPU", source: "OTel process metrics → Mimir" },
                    { metric: "Memory", source: "OTel process metrics → Mimir" },
                    { metric: "Bandwidth", source: "Edge worker counters → Mimir" },
                    { metric: "Requests / min", source: "Hono middleware counters → Mimir" },
                  ]
                ).map((row) => (
                  <tr
                    style={{ "border-top": "1px solid var(--color-border)" }}
                  >
                    <td
                      class="px-5 py-3 font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      {row.metric}
                    </td>
                    <td
                      class="px-5 py-3"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {row.source}
                    </td>
                    <td class="px-5 py-3">
                      <span
                        class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{
                          background: "color-mix(in oklab, var(--color-warning) 15%, transparent)",
                          color: "var(--color-warning)",
                          border: "1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)",
                        }}
                      >
                        Wiring
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTAs */}
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <A
              href={`/projects/${params.id}`}
              class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition"
              style={{
                background: "var(--color-primary)",
                color: "#ffffff",
                "text-decoration": "none",
              }}
            >
              Back to project
            </A>
            <A
              href="/ops"
              class="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition"
              style={{
                "border-color": "var(--color-border)",
                color: "var(--color-text)",
                background: "transparent",
                "text-decoration": "none",
              }}
            >
              Platform-wide metrics &rarr;
            </A>
          </div>

          {/* Error state */}
          <Show when={project.loading === false && project() === null}>
            <p
              class="mt-6 text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              We couldn't load this project's summary — the metrics page
              still works, but the project name shown above is a fallback.
            </p>
          </Show>
        </div>
      </div>
    </ProtectedRoute>
  );
}
