// ── /admin/pulse — Sovereign Pulse iPad Command Center ───────────────
//
// Touch-optimised admin dashboard showing platform health at a glance:
//   • The Orb — pulsing CSS sphere whose colour tracks overall health
//   • Active Agents — live count of running/pending theatre runs
//   • Mesh Health — GlueCron region reachability status
//   • Revenue Ticker — current-period gross revenue (USD cents → display)
//   • Uptime — seconds since API process boot
//
// Authorized as a free-action admin sub-route (CLAUDE.md §0.7).
// Wraps in <AdminRoute> like every other /admin/* page.
//
// Data comes from trpc.metrics.pulse (see metrics.ts). The trpc client
// here is the vanilla TRPCClient (not SolidJS-hook flavour), so we use
// createResource with trpc.<proc>.query() calls directly.

import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { type JSX, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { trpc } from "~/lib/trpc";
import { AdminRoute } from "../../components/AdminRoute";

// ── Types ─────────────────────────────────────────────────────────────

interface PulseSnapshot {
  agentCount: number;
  meshHealthy: boolean;
  revenueCents: number;
  uptimeSeconds: number;
}

type HealthLevel = "healthy" | "degraded" | "incident";

// ── Pure helpers ──────────────────────────────────────────────────────

/** Derive the health level from a pulse snapshot. */
function deriveHealth(snap: PulseSnapshot): HealthLevel {
  if (!snap.meshHealthy) return "incident";
  if (snap.agentCount > 50) return "degraded";
  return "healthy";
}

/** CSS hsl() colour for each health level. */
const HEALTH_COLOR: Record<HealthLevel, string> = {
  healthy: "hsl(142, 76%, 36%)",
  degraded: "hsl(38, 92%, 50%)",
  incident: "hsl(0, 84%, 60%)",
};

/** Human-readable status line shown beneath the orb. */
const HEALTH_LABEL: Record<HealthLevel, string> = {
  healthy: "ALL SYSTEMS NOMINAL",
  degraded: "DEGRADED",
  incident: "INCIDENT",
};

/** Format uptime seconds as Xd Xh Xm Xs. */
function formatUptime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** Format cents as a dollar amount string. */
function formatRevenue(cents: number): string {
  if (cents === 0) return "$0.00";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/** Live timestamp string. */
function formatTimestamp(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ── Page shell ────────────────────────────────────────────────────────

export default function AdminPulsePage(): JSX.Element {
  return (
    <AdminRoute>
      <PulseContent />
    </AdminRoute>
  );
}

// ── Content ───────────────────────────────────────────────────────────

function PulseContent(): JSX.Element {
  const [tick, setTick] = createSignal(0);
  const [now, setNow] = createSignal(new Date());

  // Poll every 10 seconds — tick drives the resource refetch.
  onMount(() => {
    const iv = setInterval(() => {
      setTick((n) => n + 1);
      setNow(new Date());
    }, 10_000);
    onCleanup(() => clearInterval(iv));
  });

  const [pulse, { refetch }] = createResource(tick, async () => {
    try {
      return await trpc.metrics.pulse.query();
    } catch {
      return null;
    }
  });

  const snap = (): PulseSnapshot | null => pulse() ?? null;
  const health = (): HealthLevel => {
    const s = snap();
    return s ? deriveHealth(s) : "healthy";
  };
  const color = (): string => HEALTH_COLOR[health()];

  const handleRefresh = (): void => {
    setNow(new Date());
    void refetch();
  };

  const orbCss = `
    @keyframes orb-pulse {
      0%   { transform: scale(1.00); }
      50%  { transform: scale(1.05); }
      100% { transform: scale(1.00); }
    }
    .orb-sphere {
      animation: orb-pulse 2s ease-in-out infinite;
    }
  `;

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Sovereign Pulse — Crontech Admin</Title>
      {/* Keyframe injection — SolidJS renders <style> tags in JSX */}
      <style>{orbCss}</style>

      <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <div class="mb-8 flex items-start justify-between gap-4">
          <div>
            <nav
              aria-label="Breadcrumb"
              class="mb-2 flex items-center gap-2 text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              <A
                href="/admin"
                class="font-medium transition-colors"
                style={{ color: "var(--color-text-muted)" }}
              >
                Admin
              </A>
              <span aria-hidden="true">›</span>
              <span class="font-semibold" style={{ color: "var(--color-text)" }}>
                Sovereign Pulse
              </span>
            </nav>
            <h1 class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
              Sovereign Pulse
            </h1>
            <p class="mt-1 font-mono text-xs" style={{ color: "var(--color-text-faint)" }}>
              {formatTimestamp(now())} · refreshes every 10s
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh pulse data"
            class="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-subtle)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span aria-hidden="true" class="text-base">
              &#8635;
            </span>
            <span class="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* ── Orb section ── */}
        <div
          class="mb-8 flex flex-col items-center justify-center rounded-3xl py-14"
          style={{
            background: "#0a0a0f",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* The Orb */}
          <div
            class="orb-sphere"
            style={{
              width: "200px",
              height: "200px",
              "border-radius": "50%",
              background: `radial-gradient(circle at 38% 35%, ${color()} 0%, transparent 70%)`,
              "box-shadow": `0 0 60px 20px color-mix(in srgb, ${color()} 45%, transparent),
                             0 0 120px 40px color-mix(in srgb, ${color()} 20%, transparent)`,
            }}
            role="img"
            aria-label={`Platform health orb: ${health()}`}
          />

          {/* Status label */}
          <div class="mt-8 flex flex-col items-center gap-2">
            <span class="font-mono text-lg font-bold tracking-[0.25em]" style={{ color: color() }}>
              {HEALTH_LABEL[health()]}
            </span>
            <Show when={pulse.loading}>
              <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                Updating…
              </span>
            </Show>
            <Show when={!pulse.loading && snap() === null}>
              <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                API unreachable — showing last known state
              </span>
            </Show>
          </div>
        </div>

        {/* ── Metric cards grid ── */}
        {/* 1-col on mobile, 2-col on sm+, 2x2 on md (iPad) */}
        {(() => {
          const s = snap();
          return (
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Active Agents */}
              <MetricCard
                label="Active Agents"
                icon="&#129302;"
                value={s !== null ? String(s.agentCount) : "—"}
                sub={
                  s !== null && s.agentCount === 0
                    ? "No active runs"
                    : s !== null
                      ? `${s.agentCount} run${s.agentCount === 1 ? "" : "s"} in progress`
                      : "Fetching…"
                }
                accent={
                  s !== null && s.agentCount > 50 ? "var(--color-warning)" : "var(--color-success)"
                }
                loading={pulse.loading}
              />

              {/* Mesh Health */}
              <MetricCard
                label="Mesh Health"
                icon="&#127760;"
                value={s !== null ? (s.meshHealthy ? "ONLINE" : "OFFLINE") : "—"}
                sub={
                  s !== null
                    ? s.meshHealthy
                      ? "All regions reachable"
                      : "Region orchestrator unreachable"
                    : "Fetching…"
                }
                accent={
                  s !== null
                    ? s.meshHealthy
                      ? "var(--color-success)"
                      : "var(--color-danger)"
                    : "var(--color-text-faint)"
                }
                loading={pulse.loading}
              />

              {/* Revenue Ticker */}
              <MetricCard
                label="Revenue (current period)"
                icon="&#128176;"
                value={s !== null ? formatRevenue(s.revenueCents) : "—"}
                sub="Current calendar month · USD"
                accent="var(--color-primary)"
                loading={pulse.loading}
              />

              {/* Uptime */}
              <MetricCard
                label="API Uptime"
                icon="&#9201;"
                value={s !== null ? formatUptime(s.uptimeSeconds) : "—"}
                sub="Since last API process boot"
                accent="var(--color-success)"
                loading={pulse.loading}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  icon: string;
  value: string;
  sub: string;
  accent: string;
  loading: boolean;
}

function MetricCard(props: MetricCardProps): JSX.Element {
  return (
    <div
      class="flex min-h-[120px] flex-col justify-between rounded-2xl p-5"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="flex items-center justify-between gap-2">
        <span
          class="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-faint)" }}
        >
          {props.label}
        </span>
        <span aria-hidden="true" class="text-lg leading-none">
          {props.icon}
        </span>
      </div>

      <div class="mt-4">
        <Show
          when={!props.loading}
          fallback={
            <div
              class="h-8 w-24 animate-pulse rounded-lg"
              style={{ background: "var(--color-bg-subtle)" }}
              aria-busy="true"
              aria-label="Loading…"
            />
          }
        >
          <div
            class="text-3xl font-bold tabular-nums leading-none tracking-tight"
            style={{ color: props.accent }}
          >
            {props.value}
          </div>
        </Show>
        <p class="mt-1.5 text-xs" style={{ color: "var(--color-text-faint)" }}>
          {props.sub}
        </p>
      </div>
    </div>
  );
}
