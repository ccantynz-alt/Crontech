import { Title } from "@solidjs/meta";
import { createResource, createSignal, For, Show, onCleanup, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { useAuth } from "../../stores";
import {
  parseProgressTracker,
  countByStatus,
  totalEntries,
  type ProgressEntry,
  type ProgressStatus,
  type ProgressTracker,
} from "../../lib/progress/schema";

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchTracker(): Promise<ProgressTracker> {
  const res = await fetch(`/progress.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to load progress.json: ${res.status}`);
  const raw: unknown = await res.json();
  return parseProgressTracker(raw);
}

function statusIcon(status: ProgressStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "⟳";
    case "blocked":
      return "✕";
    case "pending":
      return "○";
  }
}

function statusColor(status: ProgressStatus): string {
  switch (status) {
    case "completed":
      return "#10b981"; // emerald
    case "in_progress":
      return "#f59e0b"; // amber
    case "blocked":
      return "#ef4444"; // red
    case "pending":
      return "#6b7280"; // gray
  }
}

function statusLabel(status: ProgressStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    case "blocked":
      return "Blocked";
    case "pending":
      return "Pending";
  }
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "p0":
      return "#ef4444";
    case "p1":
      return "#f59e0b";
    case "p2":
      return "#3b82f6";
    case "p3":
      return "#6b7280";
    default:
      return "#6b7280";
  }
}

// ── Admin Guard ─────────────────────────────────────────────────────

function AdminGuard(props: { children: JSX.Element }): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = (): boolean => auth.currentUser()?.role === "admin";

  return (
    <ProtectedRoute>
      <Show
        when={isAdmin()}
        fallback={
          <Stack direction="vertical" gap="md" class="page-padded">
            <Text variant="h2" weight="bold">
              Access Denied
            </Text>
            <Text variant="body" class="text-muted">
              You do not have permission to view this page. Admin role required.
            </Text>
            <Button variant="primary" size="sm" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </Stack>
        }
      >
        {props.children}
      </Show>
    </ProtectedRoute>
  );
}

// ── Entry Row ───────────────────────────────────────────────────────

function EntryRow(props: { entry: ProgressEntry }): JSX.Element {
  const entry = props.entry;
  return (
    <div
      style={{
        display: "grid",
        "grid-template-columns": "32px 1fr auto",
        gap: "12px",
        "align-items": "start",
        padding: "12px 16px",
        "border-bottom": "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          "border-radius": "50%",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "font-size": "16px",
          "font-weight": "bold",
          color: "#fff",
          "background-color": statusColor(entry.status),
        }}
        aria-label={statusLabel(entry.status)}
        title={statusLabel(entry.status)}
      >
        {statusIcon(entry.status)}
      </div>
      <div style={{ "min-width": "0" }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            "flex-wrap": "wrap",
          }}
        >
          <Text variant="body" weight="semibold">
            {entry.title}
          </Text>
          <span
            style={{
              "font-size": "10px",
              "font-weight": "bold",
              padding: "2px 6px",
              "border-radius": "4px",
              color: "#fff",
              "background-color": priorityColor(entry.priority),
              "text-transform": "uppercase",
            }}
          >
            {entry.priority}
          </span>
        </div>
        <Text variant="caption" class="text-muted">
          {entry.description}
        </Text>
        <Show when={entry.blockedReason}>
          <Text variant="caption" class="text-muted">
            Blocked: {entry.blockedReason}
          </Text>
        </Show>
        <div style={{ display: "flex", gap: "6px", "margin-top": "4px", "flex-wrap": "wrap" }}>
          <For each={entry.tags}>{(tag) => <Badge variant="default">{tag}</Badge>}</For>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "flex-end",
          gap: "4px",
          "font-size": "11px",
          color: "rgba(255,255,255,0.55)",
          "font-family": "monospace",
        }}
      >
        <Show when={entry.commit}>
          <span>{entry.commit}</span>
        </Show>
        <Show when={entry.branch}>
          <span>{entry.branch}</span>
        </Show>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

function ProgressPage(): JSX.Element {
  const [tick, setTick] = createSignal(0);
  const [tracker, { refetch }] = createResource(tick, fetchTracker);

  // Auto-refresh every 30s for the "live" feel.
  const interval = setInterval(() => {
    setTick((t) => t + 1);
    void refetch();
  }, 30_000);
  onCleanup(() => clearInterval(interval));

  return (
    <>
      <Title>Progress Tracker - Crontech Admin</Title>
      <div
        style={{
          "min-height": "100vh",
          background: "linear-gradient(180deg, #0a0a0f 0%, #0f0f1a 100%)",
          color: "#fff",
          padding: "32px 24px",
        }}
      >
        <div style={{ "max-width": "1100px", margin: "0 auto" }}>
          <Stack direction="vertical" gap="lg">
            <div>
              <Text variant="h1" weight="bold">
                Crontech Master Game Plan
              </Text>
              <Text variant="body" class="text-muted">
                Live tracker. Every strategic decision, roadmap item, and blocker from the CFO
                lock-in session. Auto-refreshes every 30 seconds.
              </Text>
            </div>

            <Show
              when={tracker()}
              fallback={
                <Text variant="body" class="text-muted">
                  Loading progress...
                </Text>
              }
            >
              {(data) => {
                const counts = (): Record<ProgressStatus, number> => countByStatus(data());
                const total = (): number => totalEntries(data());
                const pct = (): number =>
                  total() === 0 ? 0 : Math.round((counts().completed / total()) * 100);

                return (
                  <>
                    {/* Header stats */}
                    <div
                      style={{
                        display: "grid",
                        "grid-template-columns": "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <StatBox
                        label="Completed"
                        value={`${counts().completed}`}
                        color={statusColor("completed")}
                      />
                      <StatBox
                        label="In progress"
                        value={`${counts().in_progress}`}
                        color={statusColor("in_progress")}
                      />
                      <StatBox
                        label="Pending"
                        value={`${counts().pending}`}
                        color={statusColor("pending")}
                      />
                      <StatBox
                        label="Blocked"
                        value={`${counts().blocked}`}
                        color={statusColor("blocked")}
                      />
                      <StatBox label="Total" value={`${total()}`} color="#8b5cf6" />
                      <StatBox label="Complete" value={`${pct()}%`} color="#10b981" />
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        height: "8px",
                        "border-radius": "4px",
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct()}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, #10b981, #34d399)",
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>

                    {/* Doctrine banner */}
                    <div
                      style={{
                        padding: "12px 16px",
                        "border-radius": "8px",
                        background: "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.3)",
                      }}
                    >
                      <Text variant="caption" class="text-muted">
                        DOCTRINE
                      </Text>
                      <Text variant="body" weight="semibold">
                        {data().doctrine}
                      </Text>
                    </div>

                    {/* Categories */}
                    <For each={data().categories}>
                      {(category) => (
                        <div
                          style={{
                            "border-radius": "12px",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: "16px 20px",
                              "border-bottom": "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.02)",
                            }}
                          >
                            <Text variant="h3" weight="bold">
                              {category.title}
                            </Text>
                            <Text variant="caption" class="text-muted">
                              {category.subtitle}
                            </Text>
                          </div>
                          <div>
                            <For each={category.entries}>
                              {(entry) => <EntryRow entry={entry} />}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>

                    <Text variant="caption" class="text-muted">
                      Last updated: {data().lastUpdated} · Session: {data().session}
                    </Text>
                  </>
                );
              }}
            </Show>
          </Stack>
        </div>
      </div>
    </>
  );
}

function StatBox(props: { label: string; value: string; color: string }): JSX.Element {
  return (
    <div
      style={{
        padding: "16px",
        "border-radius": "10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          "font-size": "11px",
          "text-transform": "uppercase",
          "letter-spacing": "0.08em",
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          "font-size": "28px",
          "font-weight": "bold",
          color: props.color,
          "margin-top": "4px",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

export default function AdminProgressRoute(): JSX.Element {
  return (
    <AdminGuard>
      <ProgressPage />
    </AdminGuard>
  );
}
