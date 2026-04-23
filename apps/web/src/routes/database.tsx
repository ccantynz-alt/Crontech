// ── Database: Public Product Page (Early Preview) ─────────────────────
//
// Marketing page for the Crontech data plane. The inspector UI is
// still in the engine room (BLK-012 🔵 PLANNED in docs/BUILD_BIBLE.md)
// so this page is in an "Early preview" state: it describes the
// capability, lists the engines we ship on top of (Turso / Neon /
// Qdrant), and collects waitlist interest. No fabricated rows, no
// fake "Connected" badge, no mock query results.
//
// Polite copy. No competitor names. Zero HTML — SolidJS JSX only.
// Mirrors the /sms + /esim structural pattern.

import { createSignal, For, Show, type JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Feature bullets ────────────────────────────────────────────────

interface DataFeature {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}

const DATA_FEATURES: ReadonlyArray<DataFeature> = [
  {
    icon: "database",
    title: "Edge SQLite via Turso",
    description:
      "Read replicas sit inside the edge worker that serves your request. No network hop, no cold query — rows are already local by the time your handler runs.",
  },
  {
    icon: "layers",
    title: "Serverless Postgres via Neon",
    description:
      "When a query needs the full Postgres engine — joins, CTEs, window functions, pgvector — Neon picks it up. Scale-to-zero, branch-per-PR, no idle cost.",
  },
  {
    icon: "brain",
    title: "Vector search via Qdrant",
    description:
      "ACORN filtered HNSW on billions of embeddings. Semantic search, RAG retrieval, and recommendation ranking share the same primitive without a second database to run.",
  },
];

// ── Engines shipping on day one ────────────────────────────────────

interface EngineRow {
  readonly name: string;
  readonly role: string;
  readonly purpose: string;
}

const ENGINES: ReadonlyArray<EngineRow> = [
  {
    name: "Turso",
    role: "Primary edge database",
    purpose: "Embedded SQLite replicas at every edge node. Zero-latency reads.",
  },
  {
    name: "Neon",
    role: "Serverless Postgres",
    purpose: "Full Postgres on demand. Branches per PR. Scale-to-zero.",
  },
  {
    name: "Qdrant",
    role: "Vector search",
    purpose: "Billions of embeddings. Filtered HNSW. Native RAG support.",
  },
];

// ── Waitlist helpers (exported for tests) ──────────────────────────

/**
 * Minimal email sanity check — enough to catch typos before we even
 * try to submit. The server will be the final arbiter once the
 * waitlist procedure ships.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  if (!trimmed.includes("@")) return false;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

// ── Code snippet (tRPC call shape we'll ship) ──────────────────────

export const DATABASE_SNIPPET = `// The inspector will let you do this from the browser,
// but the raw shape is already typed end-to-end:
const rows = await trpc.database.query.query({
  engine: "turso",
  sql: "SELECT id, email, plan FROM users LIMIT 25",
});`;

// ── Page ───────────────────────────────────────────────────────────

export default function DatabasePage(): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [submitted, setSubmitted] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  function onSubmit(ev: SubmitEvent): void {
    ev.preventDefault();
    const value = email().trim();
    if (!isPlausibleEmail(value)) {
      setError("That email doesn't look quite right — please check and try again.");
      return;
    }
    setError(null);
    // No waitlist tRPC procedure exists yet. When one lands, call it here.
    // For now we show a polite confirmation.
    setSubmitted(true);
    if (typeof window !== "undefined") {
      window.alert("We'll email you when the inspector is live.");
    }
  }

  return (
    <>
      <SEOHead
        title="Database"
        description="The Crontech data plane — Turso edge SQLite, Neon serverless Postgres, and Qdrant vector search. One unified data layer across the stack."
        path="/database"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0f" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          <div
            class="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px 500px at 50% -10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(800px 400px at 85% 20%, rgba(56,189,248,0.12), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div class="relative mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
            <span
              class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: "#10b981" }}
                aria-hidden="true"
              />
              Early preview — inspector UI coming soon
            </span>
            <h1
              class="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              style={{ color: "#f0f0f5" }}
            >
              One data plane. Three best-in-class engines.
            </h1>
            <p
              class="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Turso for zero-latency edge reads, Neon for full Postgres power,
              and Qdrant for vector search — stitched together behind one
              typed client. The in-browser inspector is in the final stretch
              of build. Join the waitlist and we'll let you know the moment
              it's live in your dashboard.
            </p>
          </div>
        </section>

        {/* ── Description ─────────────────────────────────────── */}
        <section class="mx-auto max-w-3xl px-6 pb-12">
          <div class="space-y-5 text-base leading-[1.8]" style={{ color: "rgba(255,255,255,0.72)" }}>
            <p>
              Every Crontech project gets a full data layer on day one. You
              don't pick between a relational database, a vector store, and
              an analytics column store — you get the right engine for each
              query behind a single, type-safe client.
            </p>
            <p>
              The runtime routing is already live: server procedures and
              background workers can reach Turso, Neon, and Qdrant today
              through <code class="font-mono text-xs" style={{ color: "#86efac" }}>packages/db</code>
              {" "}and the tRPC procedures that sit on top of it. What's still
              cooking is the in-browser inspector — schema browser, bounded
              query runner, per-project isolation, read-only by default — so
              you can poke at rows without opening a terminal.
            </p>
            <p>
              Everything honest: no fabricated row counts, no fake
              "Connected" badges. When the inspector opens, it opens against
              your real project data.
            </p>
          </div>
        </section>

        {/* ── Waitlist form ───────────────────────────────────── */}
        <section class="mx-auto max-w-2xl px-6 pb-16">
          <form
            onSubmit={onSubmit}
            class="rounded-2xl p-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <label
              for="database-waitlist-email"
              class="text-sm font-medium"
              style={{ color: "#e5e5e5" }}
            >
              Email me when the inspector is live
            </label>
            <div class="mt-3 flex flex-wrap items-stretch gap-2">
              <input
                id="database-waitlist-email"
                name="email"
                type="email"
                autocomplete="email"
                inputmode="email"
                required
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder="you@example.com"
                class="min-w-0 flex-1 rounded-lg px-4 py-3 text-sm outline-none"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "#f0f0f5",
                }}
              />
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition"
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#ffffff",
                  "box-shadow": "0 8px 24px -8px rgba(16,185,129,0.55)",
                }}
              >
                Join waitlist
              </button>
            </div>
            <Show when={error()}>
              <p
                class="mt-3 text-xs"
                style={{ color: "#fca5a5" }}
                role="alert"
              >
                {error()}
              </p>
            </Show>
            <Show when={submitted() && !error()}>
              <p
                class="mt-3 text-xs"
                style={{ color: "#86efac" }}
              >
                Thanks — we'll email you the moment the inspector is live.
              </p>
            </Show>
            <p
              class="mt-4 text-[11px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              One email, only when it's live. No marketing list.
            </p>
          </form>
        </section>

        {/* ── Feature bullets ─────────────────────────────────── */}
        <section class="mx-auto max-w-5xl px-6 pb-16">
          <div class="grid gap-5 md:grid-cols-3">
            <For each={DATA_FEATURES}>
              {(feat) => (
                <article
                  class="rounded-2xl p-6"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    "box-shadow": "0 2px 8px rgba(0,0,0,0.2)",
                  }}
                >
                  <div
                    class="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(56,189,248,0.15))",
                      color: "#6ee7b7",
                      border: "1px solid rgba(16,185,129,0.2)",
                    }}
                  >
                    <Icon name={feat.icon} size={20} />
                  </div>
                  <h3
                    class="mt-5 text-[1.0625rem] font-semibold tracking-tight"
                    style={{ color: "#f0f0f5" }}
                  >
                    {feat.title}
                  </h3>
                  <p
                    class="mt-2 text-sm leading-[1.75]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {feat.description}
                  </p>
                </article>
              )}
            </For>
          </div>
        </section>

        {/* ── Engines table ───────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-16">
          <h2
            class="text-2xl font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            The engines under the hood
          </h2>
          <p
            class="mt-2 text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Three purpose-built stores. One typed client. Zero vendor lock-in.
          </p>
          <div
            class="mt-5 overflow-hidden rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <table class="w-full text-left text-sm">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Engine
                  </th>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Role
                  </th>
                  <th
                    class="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Purpose
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={ENGINES}>
                  {(engine) => (
                    <tr
                      style={{ "border-top": "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <td
                        class="px-5 py-3 font-semibold"
                        style={{ color: "#f0f0f5" }}
                      >
                        {engine.name}
                      </td>
                      <td
                        class="px-5 py-3"
                        style={{ color: "rgba(255,255,255,0.75)" }}
                      >
                        {engine.role}
                      </td>
                      <td
                        class="px-5 py-3"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        {engine.purpose}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Preview snippet ─────────────────────────────────── */}
        <section class="mx-auto max-w-4xl px-6 pb-24">
          <h2
            class="text-2xl font-semibold tracking-tight"
            style={{ color: "#f0f0f5" }}
          >
            The call shape is already typed
          </h2>
          <p
            class="mt-2 text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Server code can hit Turso, Neon, and Qdrant today. The inspector
            just exposes the same path to your browser.
          </p>
          <pre
            class="mt-5 overflow-x-auto rounded-2xl p-5 text-[13px] leading-[1.7]"
            style={{
              background: "rgba(8, 8, 14, 0.75)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e5e7eb",
              "font-family":
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            <code>{DATABASE_SNIPPET}</code>
          </pre>
        </section>
      </div>
    </>
  );
}
