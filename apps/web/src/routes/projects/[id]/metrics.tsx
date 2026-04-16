import { createSignal, createEffect, createMemo, onCleanup, For } from "solid-js";
import type { JSX } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { SEOHead } from "../../../components/SEOHead";
import { MetricsChart } from "../../../components/MetricsChart";
import type { DataPoint } from "../../../components/MetricsChart";
import { MetricCard } from "../../../components/MetricCard";
import type { MetricCardProps } from "../../../components/MetricCard";

// ── Time Range ──────────────────────────────────────────────────────

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

interface TimeRangeOption {
  value: TimeRange;
  label: string;
  points: number;
  intervalMs: number;
}

const TIME_RANGES: TimeRangeOption[] = [
  { value: "1h", label: "1H", points: 60, intervalMs: 60_000 },
  { value: "6h", label: "6H", points: 72, intervalMs: 5 * 60_000 },
  { value: "24h", label: "24H", points: 96, intervalMs: 15 * 60_000 },
  { value: "7d", label: "7D", points: 84, intervalMs: 2 * 3600_000 },
  { value: "30d", label: "30D", points: 90, intervalMs: 8 * 3600_000 },
];

// ── Mock Data Generators ────────────────────────────────────────────

function generateCpuData(count: number, intervalMs: number): DataPoint[] {
  const now = Date.now();
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = now - (count - 1 - i) * intervalMs;
    // Oscillating 20-60% with noise — simulate real container workload
    const hour = new Date(t).getHours();
    const dailyCurve = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 12;
    const base = 38 + dailyCurve;
    const noise = (Math.random() - 0.5) * 14;
    const spike = Math.random() > 0.93 ? Math.random() * 18 : 0;
    points.push({ timestamp: t, value: Math.max(5, Math.min(95, base + noise + spike)) });
  }
  return points;
}

function generateMemoryData(count: number, intervalMs: number): DataPoint[] {
  const now = Date.now();
  const points: DataPoint[] = [];
  let current = 42 + Math.random() * 6;
  for (let i = 0; i < count; i++) {
    const t = now - (count - 1 - i) * intervalMs;
    // Memory: steady around 45% with slow drift and occasional GC drops
    const drift = (Math.random() - 0.48) * 1.5;
    current += drift;
    if (Math.random() > 0.95) current -= 3 + Math.random() * 4; // GC
    current = Math.max(30, Math.min(75, current));
    points.push({ timestamp: t, value: current });
  }
  return points;
}

function generateBandwidthData(count: number, intervalMs: number): DataPoint[] {
  const now = Date.now();
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = now - (count - 1 - i) * intervalMs;
    // Bandwidth: spiky — bursts of traffic
    const hour = new Date(t).getHours();
    const isActive = hour >= 8 && hour <= 22;
    const base = isActive ? 120 + Math.random() * 60 : 20 + Math.random() * 30;
    const spike = Math.random() > 0.88 ? Math.random() * 200 : 0;
    points.push({ timestamp: t, value: Math.max(5, base + spike) });
  }
  return points;
}

function generateRequestsData(count: number, intervalMs: number): DataPoint[] {
  const now = Date.now();
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = now - (count - 1 - i) * intervalMs;
    // Requests: daily pattern — peak during business hours
    const hour = new Date(t).getHours();
    const dailyMultiplier = Math.exp(-0.5 * ((hour - 14) / 4) ** 2); // Gaussian peak at 2pm
    const base = 800 + dailyMultiplier * 3200;
    const noise = (Math.random() - 0.5) * 400;
    points.push({ timestamp: t, value: Math.max(50, base + noise) });
  }
  return points;
}

// ── Metric Configs ──────────────────────────────────────────────────

interface MetricConfig {
  key: string;
  name: string;
  icon: string;
  color: string;
  unit: string;
  generator: (count: number, interval: number) => DataPoint[];
  formatCard: (data: DataPoint[]) => string;
  getStatus: (data: DataPoint[]) => MetricCardProps["status"];
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: "cpu",
    name: "CPU Usage",
    icon: "\u{1F4BB}",
    color: "#4f46e5",
    unit: "%",
    generator: generateCpuData,
    formatCard: (data) => {
      const last = data[data.length - 1];
      return last ? `${last.value.toFixed(1)}` : "0";
    },
    getStatus: (data) => {
      const last = data[data.length - 1];
      if (!last) return "healthy";
      if (last.value > 80) return "critical";
      if (last.value > 60) return "warning";
      return "healthy";
    },
  },
  {
    key: "memory",
    name: "Memory Usage",
    icon: "\u{1F9E0}",
    color: "#059669",
    unit: "%",
    generator: generateMemoryData,
    formatCard: (data) => {
      const last = data[data.length - 1];
      return last ? `${last.value.toFixed(1)}` : "0";
    },
    getStatus: (data) => {
      const last = data[data.length - 1];
      if (!last) return "healthy";
      if (last.value > 85) return "critical";
      if (last.value > 70) return "warning";
      return "healthy";
    },
  },
  {
    key: "bandwidth",
    name: "Bandwidth",
    icon: "\u{1F4E1}",
    color: "#7c3aed",
    unit: "MB/s",
    generator: generateBandwidthData,
    formatCard: (data) => {
      const last = data[data.length - 1];
      return last ? `${last.value.toFixed(0)}` : "0";
    },
    getStatus: (data) => {
      const last = data[data.length - 1];
      if (!last) return "healthy";
      if (last.value > 350) return "warning";
      return "healthy";
    },
  },
  {
    key: "requests",
    name: "Requests",
    icon: "\u26A1",
    color: "#ea580c",
    unit: "req/min",
    generator: generateRequestsData,
    formatCard: (data) => {
      const last = data[data.length - 1];
      if (!last) return "0";
      if (last.value >= 1000) return `${(last.value / 1000).toFixed(1)}K`;
      return `${last.value.toFixed(0)}`;
    },
    getStatus: (data) => {
      const last = data[data.length - 1];
      if (!last) return "healthy";
      if (last.value > 4000) return "warning";
      return "healthy";
    },
  },
];

// ── Helper: compute % change ────────────────────────────────────────

function computeChange(data: DataPoint[]): number {
  if (data.length < 2) return 0;
  const mid = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, mid);
  const secondHalf = data.slice(mid);
  const avgFirst = firstHalf.reduce((s, d) => s + d.value, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, d) => s + d.value, 0) / secondHalf.length;
  if (avgFirst === 0) return 0;
  return ((avgSecond - avgFirst) / avgFirst) * 100;
}

// ── Page Component ──────────────────────────────────────────────────

export default function ProjectMetricsPage(): ReturnType<typeof ProtectedRoute> {
  const params = useParams<{ id: string }>();
  const [timeRange, setTimeRange] = createSignal<TimeRange>("24h");
  const [autoRefresh, setAutoRefresh] = createSignal(false);
  const [lastRefresh, setLastRefresh] = createSignal(Date.now());

  // Project name (would come from tRPC in production)
  const projectName = createMemo((): string => {
    const id = params.id;
    // Mock: derive a displayable name from the ID
    const names: Record<string, string> = {
      "proj-1": "crontech-web",
      "proj-2": "crontech-api",
      "proj-3": "edge-workers",
    };
    return names[id] ?? `project-${id}`;
  });

  // Current time range config
  const rangeConfig = createMemo((): TimeRangeOption => {
    const range = timeRange();
    return TIME_RANGES.find((r) => r.value === range) ?? TIME_RANGES[2]!;
  });

  // Generate data for all metrics (reactive to timeRange + lastRefresh)
  const metricsData = createMemo((): Record<string, DataPoint[]> => {
    // Touch lastRefresh to make this reactive to refresh triggers
    const _refresh = lastRefresh();
    const config = rangeConfig();
    const result: Record<string, DataPoint[]> = {};
    for (const metric of METRIC_CONFIGS) {
      result[metric.key] = metric.generator(config.points, config.intervalMs);
    }
    return result;
  });

  // Auto-refresh interval
  createEffect((): void => {
    if (!autoRefresh()) return;
    const interval = setInterval(() => {
      setLastRefresh(Date.now());
    }, 30_000);
    onCleanup(() => clearInterval(interval));
  });

  // Format time for the chart based on range
  const formatTimeForRange = createMemo((): ((ts: number) => string) => {
    const range = timeRange();
    if (range === "1h" || range === "6h") {
      return (ts: number): string => {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      };
    }
    if (range === "24h") {
      return (ts: number): string => {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, "0")}:00`;
      };
    }
    // 7d / 30d
    return (ts: number): string => {
      const d = new Date(ts);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };
  });

  return (
    <ProtectedRoute>
      <SEOHead
        title={`Metrics - ${projectName()}`}
        description={`Real-time container metrics for ${projectName()} — CPU, memory, bandwidth, and request monitoring.`}
        path={`/projects/${params.id}/metrics`}
      />

      <div class="min-h-screen bg-white">
        <div class="mx-auto max-w-[1440px] px-6 py-8 lg:px-8">
          {/* ── Header ────────────────────────────────────────────── */}
          <div class="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
                  style={{
                    background: "rgba(79,70,229,0.08)",
                    color: "#4f46e5",
                  }}
                >
                  {"\u{1F4CA}"}
                </div>
                <h1 class="text-2xl font-bold tracking-tight text-slate-900">
                  {projectName()}
                </h1>
                <span class="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                  Live
                </span>
              </div>
              <p class="text-sm text-slate-500">
                Container metrics &middot; Real-time monitoring
              </p>
            </div>

            <div class="flex items-center gap-3">
              {/* Auto-refresh toggle */}
              <button
                type="button"
                class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200"
                style={{
                  "border-color": autoRefresh() ? "rgb(167,243,208)" : "rgb(226,232,240)",
                  background: autoRefresh() ? "rgb(236,253,245)" : "rgb(255,255,255)",
                  color: autoRefresh() ? "#047857" : "#475569",
                }}
                onClick={() => setAutoRefresh((v) => !v)}
              >
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: autoRefresh() ? "#059669" : "#94a3b8",
                  }}
                  classList={{ "animate-pulse": autoRefresh() }}
                />
                Auto-refresh {autoRefresh() ? "ON" : "OFF"}
              </button>

              {/* Time range selector */}
              <div class="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <For each={TIME_RANGES}>
                  {(range) => (
                    <button
                      type="button"
                      class="rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200"
                      style={{
                        background: timeRange() === range.value ? "rgb(255,255,255)" : "transparent",
                        color: timeRange() === range.value ? "#4f46e5" : "#64748b",
                        "box-shadow": timeRange() === range.value ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                      }}
                      onClick={() => {
                        setTimeRange(range.value);
                        setLastRefresh(Date.now());
                      }}
                    >
                      {range.label}
                    </button>
                  )}
                </For>
              </div>

              {/* Manual refresh */}
              <button
                type="button"
                class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50"
                onClick={() => setLastRefresh(Date.now())}
              >
                Refresh
              </button>
            </div>
          </div>

          {/* ── Metric Summary Cards ──────────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={METRIC_CONFIGS}>
              {(config) => {
                const data = createMemo((): DataPoint[] => metricsData()[config.key] ?? []);
                const sparkline = createMemo((): number[] => {
                  const pts = data();
                  // Take last 20 points for sparkline
                  const subset = pts.slice(-20);
                  return subset.map((d) => d.value);
                });
                return (
                  <MetricCard
                    name={config.name}
                    value={config.formatCard(data())}
                    unit={config.unit}
                    change={computeChange(data())}
                    status={config.getStatus(data())}
                    sparkline={sparkline()}
                    color={config.color}
                    icon={config.icon}
                  />
                );
              }}
            </For>
          </div>

          {/* ── Full Charts Grid ──────────────────────────────────── */}
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <For each={METRIC_CONFIGS}>
              {(config) => {
                const data = createMemo((): DataPoint[] => metricsData()[config.key] ?? []);
                return (
                  <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {/* Chart header */}
                    <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                      <div class="flex items-center gap-3">
                        <div
                          class="h-2 w-2 rounded-full"
                          style={{ background: config.color }}
                        />
                        <span class="text-sm font-semibold text-slate-900">
                          {config.name}
                        </span>
                      </div>
                      <span class="text-xs text-slate-500">
                        {rangeConfig().points} data points
                      </span>
                    </div>
                    {/* Chart body */}
                    <div class="px-2 py-4">
                      <MetricsChart
                        data={data()}
                        color={config.color}
                        label={config.name}
                        unit={config.unit}
                        height={280}
                        formatValue={(v: number): string => {
                          if (config.key === "requests") {
                            if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
                            return v.toFixed(0);
                          }
                          return v.toFixed(1);
                        }}
                        formatTime={formatTimeForRange()}
                      />
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* ── Footer info bar ───────────────────────────────────── */}
          <div class="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3">
            <div class="flex items-center gap-4 text-xs text-slate-600">
              <span>
                Region:{" "}
                <span class="font-medium text-slate-900">us-east-1</span>
              </span>
              <span class="h-3 w-px bg-slate-200" />
              <span>
                Runtime:{" "}
                <span class="font-medium text-slate-900">Bun 1.3.9</span>
              </span>
              <span class="h-3 w-px bg-slate-200" />
              <span>
                Edge:{" "}
                <span class="font-medium text-slate-900">330+ cities</span>
              </span>
            </div>
            <span class="text-[10px] text-slate-500">
              Last updated: {new Date(lastRefresh()).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
