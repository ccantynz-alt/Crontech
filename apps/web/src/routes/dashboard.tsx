import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { OnboardingWizard } from "../components/OnboardingWizard";
import { ProgressTracker } from "../components/ProgressTracker";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";
import { useQuery } from "../lib/use-trpc";

// ── Animated Stat Card ────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  delta?: string | undefined;
  icon: string;
  accentColor: string;
}

function StatCard(props: StatCardProps): JSX.Element {
  return (
    <div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:border-slate-300 hover:shadow-md group">
      <div class="relative z-10 flex items-start justify-between">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-widest text-slate-500">
            {props.label}
          </span>
          <span class="text-3xl font-bold tracking-tight text-slate-900">
            {props.value}
          </span>
          <Show when={props.delta}>
            <span class="mt-1 text-xs font-medium text-emerald-700">
              {props.delta}
            </span>
          </Show>
        </div>
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
          style={{
            background: `${props.accentColor}14`,
            color: props.accentColor,
          }}
        >
          {props.icon}
        </div>
      </div>

      {/* Bottom accent line */}
      <div
        class="absolute bottom-0 left-0 h-[2px] w-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: props.accentColor }}
      />
    </div>
  );
}

// ── Quick Action Card ─────────────────────────────────────────────────

interface QuickActionProps {
  title: string;
  description: string;
  href: string;
  label: string;
  badge?: string | undefined;
  icon: string;
  gradient: string;
}

function QuickAction(props: QuickActionProps): JSX.Element {
  return (
    <div class="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:border-slate-300 hover:shadow-md">
      <div class="relative z-10 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">{props.icon}</span>
            <span class="text-sm font-semibold text-slate-900">{props.title}</span>
          </div>
          <Show when={props.badge}>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: `${props.gradient}14`,
                color: props.gradient,
              }}
            >
              {props.badge}
            </span>
          </Show>
        </div>
        <p class="text-xs leading-relaxed text-slate-600">{props.description}</p>
        <A href={props.href}>
          <button
            class="mt-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            type="button"
          >
            {props.label}
          </button>
        </A>
      </div>
    </div>
  );
}

// ── Activity Item ─────────────────────────────────────────────────────

interface ActivityItemProps {
  icon: string;
  title: string;
  description: string;
  time: string;
  accentColor: string;
  href?: string | undefined;
}

function ActivityItem(props: ActivityItemProps): JSX.Element {
  const inner = (
    <div class="flex items-start gap-4 rounded-xl border border-transparent px-4 py-3 transition-all duration-200 hover:border-slate-200 hover:bg-slate-50">
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{
          background: `${props.accentColor}14`,
          color: props.accentColor,
        }}
      >
        {props.icon}
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-sm font-medium text-slate-900">{props.title}</span>
        <span class="text-xs text-slate-600">{props.description}</span>
      </div>
      <span class="shrink-0 text-[11px] text-slate-500">{props.time}</span>
    </div>
  );

  return (
    <Show when={props.href} fallback={inner}>
      <A href={props.href!}>{inner}</A>
    </Show>
  );
}

// ── Usage Metric Row ──────────────────────────────────────────────────

function UsageMetric(props: { label: string; value: string; color: string }): JSX.Element {
  return (
    <div class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div class="flex items-center gap-3">
        <span
          class="h-2.5 w-2.5 rounded-full"
          style={{ background: props.color }}
        />
        <span class="text-xs text-slate-600">{props.label}</span>
      </div>
      <span class="font-mono text-sm font-semibold text-slate-900">{props.value}</span>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────

export default function DashboardPage(): ReturnType<typeof ProtectedRoute> {
  const auth = useAuth();

  const greeting = createMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Burning the midnight oil";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 22) return "Good evening";
    return "Working late";
  });

  const firstName = createMemo((): string => {
    const name = auth.currentUser()?.displayName;
    if (!name) return "builder";
    return name.split(" ")[0] ?? "builder";
  });

  // ── Data queries ──
  const health = useQuery(() =>
    trpc.health.query().catch(() => ({ status: "error" as const })),
  );

  const usage = useQuery(() =>
    trpc.analytics.getUsageStats.query().catch(() => ({
      pageViews: 0,
      featureUsage: 0,
      aiGenerations: 0,
      recentEvents: [],
    })),
  );

  const unread = useQuery(() =>
    trpc.notifications.getUnread.query().catch(() => [] as unknown[]),
  );

  const userList = useQuery(() =>
    trpc.users.list
      .query({ limit: 1 })
      .catch(() => ({ items: [], total: 0, nextCursor: null })),
  );

  const products = useQuery(() =>
    trpc.products.list.query().catch(() => []),
  );

  const fmt = (n: number | undefined): string =>
    n === undefined ? "--" : n.toLocaleString();

  // ── System status derived from real health check ──
  //
  // We only show the API row here — it's the one chip we can verify from
  // a single tRPC call. The full service fan-out (database, qdrant, stripe,
  // email, sentinel) lives on /status, which reads the /health/monitor
  // endpoint directly. No more fabricated "always green" indicators.
  const apiIndicator = createMemo(() => {
    if (health.loading()) return { status: "Checking…", color: "#64748b" };
    if (health.data()?.status === "ok") return { status: "Online", color: "#059669" };
    return { status: "Degraded", color: "#e11d48" };
  });

  // ── Activity feed: real data or get-started checklist ──
  const hasProducts = createMemo(
    () => !products.loading() && (products.data() ?? []).length > 0,
  );

  const getStartedItems: ActivityItemProps[] = [
    { icon: "\u{2795}", title: "Create your first project", description: "Set up a new site, app, or API project", time: "Step 1", accentColor: "#4f46e5", href: "/builder" },
    { icon: "\u{2728}", title: "Try the Composer", description: "Generate a component tree from a prompt. Routes through client GPU, edge, or cloud.", time: "Step 2", accentColor: "#e11d48", href: "/builder" },
    { icon: "\u{26A1}", title: "Open Claude Chat", description: "Direct API access -- your key, your data, your control", time: "Step 3", accentColor: "#ea580c", href: "/chat" },
    { icon: "\u{1F511}", title: "Configure API keys", description: "Add your OpenAI, Anthropic, or other provider keys", time: "Step 4", accentColor: "#0891b2", href: "/settings" },
    { icon: "\u{1F4CB}", title: "Browse templates", description: "Start from a battle-tested blueprint and customize", time: "Step 5", accentColor: "#059669", href: "/templates" },
  ];

  const quickActions: QuickActionProps[] = [
    { title: "Component Composer", description: "Generate validated SolidJS component trees from a prompt. Three-tier routing, zero boilerplate.", href: "/builder", label: "Open Composer", badge: "Popular", icon: "\u{1F680}", gradient: "#4f46e5" },
    { title: "Video Editor", description: "GPU-accelerated editing straight in the browser. Effects, transitions, encoding -- all on-device.", href: "/video", label: "Open editor", badge: "WebGPU", icon: "\u{1F3AC}", gradient: "#e11d48" },
    { title: "Real-Time Collaboration", description: "Start a session. Invite your team. Let AI agents co-author alongside them.", href: "/collab", label: "Start session", icon: "\u{1F91D}", gradient: "#0891b2" },
    { title: "AI Playground", description: "Test prompts, swap models, tune agents. Ship from notebook to production in one click.", href: "/ai-playground", label: "Open playground", icon: "\u{1F9EA}", gradient: "#059669" },
    { title: "Claude Chat", description: "Direct Anthropic API access. No subscriptions. Your key, your data, your control.", href: "/chat", label: "Open chat", icon: "\u{26A1}", gradient: "#ea580c" },
    { title: "Repositories", description: "Your repos, PRs, branches, issues, and CI status. All in one command center.", href: "/repos", label: "View repos", icon: "\u{1F4BB}", gradient: "#7c3aed" },
    { title: "Templates", description: "Start from a battle-tested blueprint. Clone, customize, deploy in under five minutes.", href: "/templates", label: "Browse templates", icon: "\u{1F4CB}", gradient: "#d97706" },
    { title: "Docs & Guides", description: "Learn the platform like the pros. Architecture deep-dives, recipes, and API reference.", href: "/docs", label: "Read docs", icon: "\u{1F4D6}", gradient: "#4f46e5" },
  ];

  return (
    <ProtectedRoute>
      <OnboardingWizard />
      <Title>Dashboard — Crontech</Title>

      <div class="min-h-screen bg-white">
        <div class="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* ── Header ──────────────────────────────────────────────── */}
          <div class="mb-8 flex flex-col gap-1">
            <span class="text-xs font-medium uppercase tracking-widest text-slate-500">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <h1 class="text-3xl font-bold tracking-tight text-slate-900">
              {greeting()},{" "}
              <span class="text-indigo-600">{firstName()}</span>
            </h1>
            <p class="text-sm text-slate-600">
              Your command center. Everything you need, one click away.
            </p>
          </div>

          {/* ── System Status Bar ───────────────────────────────────── */}
          <div class="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3">
            <span class="text-xs font-semibold uppercase tracking-widest text-slate-500">
              System Status
            </span>
            <div class="h-4 w-px bg-slate-200" />
            <div class="flex items-center gap-2">
              <div
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: apiIndicator().color }}
              />
              <span class="text-xs text-slate-600">
                API:{" "}
                <span class="font-medium text-slate-900">
                  {apiIndicator().status}
                </span>
              </span>
            </div>
            <A
              href="/status"
              class="ml-auto text-xs text-indigo-600 transition-colors hover:text-indigo-700"
            >
              Full service status →
            </A>
          </div>

          {/* ── Stats Grid ──────────────────────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Projects"
              value={userList.loading() ? "--" : fmt(userList.data()?.total)}
              icon="\u{1F4C1}"
              accentColor="#4f46e5"
            />
            <StatCard
              label="Deployments"
              value={usage.loading() ? "--" : fmt(usage.data()?.featureUsage)}
              icon="\u{1F680}"
              accentColor="#0891b2"
            />
            <StatCard
              label="AI Generations"
              value={usage.loading() ? "--" : fmt(usage.data()?.aiGenerations)}
              delta={
                usage.data()?.pageViews
                  ? `${fmt(usage.data()?.pageViews)} page views`
                  : undefined
              }
              icon="\u{1F916}"
              accentColor="#059669"
            />
            <StatCard
              label="Unread Alerts"
              value={
                unread.loading()
                  ? "--"
                  : String((unread.data() ?? []).length)
              }
              icon="\u{1F514}"
              accentColor="#d97706"
            />
          </div>

          {/* ── Main Grid: Activity + Charts ────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Recent Activity / Get Started */}
            <div class="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                  <span class="text-sm font-semibold text-slate-900">
                    <Show when={hasProducts()} fallback="Get Started">
                      Recent Activity
                    </Show>
                  </span>
                </div>
                <A href="/settings" class="text-xs text-slate-600 hover:text-slate-900 transition-colors">
                  View all
                </A>
              </div>
              <div class="divide-y divide-slate-100 p-2">
                <Show
                  when={hasProducts()}
                  fallback={
                    <For each={getStartedItems}>
                      {(item) => (
                        <ActivityItem
                          icon={item.icon}
                          title={item.title}
                          description={item.description}
                          time={item.time}
                          accentColor={item.accentColor}
                          href={item.href}
                        />
                      )}
                    </For>
                  }
                >
                  <For each={(usage.data()?.recentEvents ?? []).slice(0, 5)}>
                    {(evt) => (
                      <ActivityItem
                        icon={
                          evt.category === "ai_generation"
                            ? "\u{1F916}"
                            : evt.category === "feature_usage"
                              ? "\u{26A1}"
                              : evt.category === "page_view"
                                ? "\u{1F4C4}"
                                : "\u{1F4CB}"
                        }
                        title={evt.event}
                        description={evt.category.replace(/_/g, " ")}
                        time={new Date(evt.timestamp).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                        accentColor={
                          evt.category === "ai_generation"
                            ? "#4f46e5"
                            : evt.category === "feature_usage"
                              ? "#d97706"
                              : "#0891b2"
                        }
                      />
                    )}
                  </For>
                </Show>
              </div>
            </div>

            {/* Usage summary — real numbers from analytics, no faked charts */}
            <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <span class="text-sm font-semibold text-slate-900">Usage summary</span>
                <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  all-time
                </span>
              </div>
              <div class="flex flex-col gap-3 p-6">
                <UsageMetric
                  label="AI generations"
                  value={usage.loading() ? "…" : fmt(usage.data()?.aiGenerations)}
                  color="#059669"
                />
                <UsageMetric
                  label="Page views"
                  value={usage.loading() ? "…" : fmt(usage.data()?.pageViews)}
                  color="#4f46e5"
                />
                <UsageMetric
                  label="Feature events"
                  value={usage.loading() ? "…" : fmt(usage.data()?.featureUsage)}
                  color="#0891b2"
                />
                <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Time-series charts arrive with the analytics rollup service
                  (BLK-011). Until then, these are the aggregate counts from
                  your analytics events.
                </p>
              </div>
            </div>
          </div>

          {/* ── Quick Actions ───────────────────────────────────────── */}
          <div class="mb-8">
            <div class="mb-4 flex items-center gap-3">
              <span class="text-sm font-semibold text-slate-900">
                Quick Actions
              </span>
              <div class="h-px flex-1 bg-slate-200" />
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={quickActions}>
                {(action) => (
                  <QuickAction
                    title={action.title}
                    description={action.description}
                    href={action.href}
                    label={action.label}
                    badge={action.badge}
                    icon={action.icon}
                    gradient={action.gradient}
                  />
                )}
              </For>
            </div>
          </div>

          <ProgressTracker />

          {/* ── Account Card ────────────────────────────────────────── */}
          <div class="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6">
            <div class="mb-4 flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                style={{ background: "rgba(79,70,229,0.08)", color: "#4f46e5" }}
              >
                {firstName().charAt(0).toUpperCase()}
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-semibold text-slate-900">
                  {auth.currentUser()?.displayName ?? "Unknown"}
                </span>
                <span class="text-xs text-slate-600">
                  {auth.currentUser()?.email ?? "--"}
                </span>
              </div>
              <Badge variant="info" size="sm" class="ml-auto">
                {auth.currentUser()?.role ?? "member"}
              </Badge>
            </div>
            <div class="flex items-center gap-6 text-xs text-slate-600">
              <span>
                Member since{" "}
                {auth.currentUser()?.createdAt
                  ? new Date(
                      auth.currentUser()!.createdAt,
                    ).toLocaleDateString()
                  : "--"}
              </span>
              <A
                href="/settings"
                class="font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                Manage account
              </A>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
