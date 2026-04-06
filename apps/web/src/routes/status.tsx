import { Title } from "@solidjs/meta";
import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import { Card, Stack, Text } from "@back-to-the-future/ui";

interface ServiceCheck {
  name: string;
  status: "ok" | "degraded" | "down" | "unknown";
  latencyMs: number;
  detail?: string;
}

interface HealthSnapshot {
  timestamp: string;
  overall: "ok" | "degraded" | "down" | "unknown";
  services: ServiceCheck[];
  memoryMb: number;
  uptimeSec: number;
}

interface MonitorResponse {
  current: HealthSnapshot | null;
  history: HealthSnapshot[];
  queue: { pending: number; processed: number; succeeded: number; failed: number };
}

function statusColor(status: string): string {
  if (status === "ok") return "#10b981";
  if (status === "degraded") return "#f59e0b";
  if (status === "down") return "#ef4444";
  return "#6b7280";
}

function statusLabel(status: string): string {
  if (status === "ok") return "Operational";
  if (status === "degraded") return "Degraded";
  if (status === "down") return "Outage";
  return "Unknown";
}

export default function StatusPage(): ReturnType<typeof Stack> {
  const [data, setData] = createSignal<MonitorResponse | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function fetchHealth(): Promise<void> {
    try {
      const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
      const base = meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${base}/api/health/monitor`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MonitorResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load status");
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    void fetchHealth();
    timer = setInterval(fetchHealth, 30_000);
  });
  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  return (
    <>
      <Title>Status - Back to the Future</Title>
      <Stack direction="vertical" gap="lg">
        <Text variant="h1">Platform Status</Text>

        <Show when={error()}>
          <Card padding="md">
            <Text variant="body">Status feed temporarily unavailable. Retrying...</Text>
          </Card>
        </Show>

        <Show when={data()}>
          {(d) => (
            <>
              <Card padding="md">
                <Stack direction="horizontal" gap="md">
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      "border-radius": "50%",
                      background: statusColor(d().current?.overall ?? "unknown"),
                    }}
                  />
                  <Text variant="h3">{statusLabel(d().current?.overall ?? "unknown")}</Text>
                </Stack>
              </Card>

              <Stack direction="vertical" gap="sm">
                <Text variant="h2">Services</Text>
                <For each={d().current?.services ?? []}>
                  {(svc) => (
                    <Card padding="sm">
                      <Stack direction="horizontal" gap="md">
                        <div
                          style={{
                            width: "12px",
                            height: "12px",
                            "border-radius": "50%",
                            background: statusColor(svc.status),
                          }}
                        />
                        <Text variant="body" weight="semibold">{svc.name}</Text>
                        <Text variant="body">{statusLabel(svc.status)} - {svc.latencyMs}ms</Text>
                        <Show when={svc.detail}>
                          <Text variant="caption">{svc.detail}</Text>
                        </Show>
                      </Stack>
                    </Card>
                  )}
                </For>
              </Stack>

              <Stack direction="vertical" gap="sm">
                <Text variant="h2">Last 24h</Text>
                <Card padding="md">
                  <div style={{ display: "flex", gap: "2px", "align-items": "flex-end", height: "60px" }}>
                    <For each={d().history.slice(-96)}>
                      {(snap) => (
                        <div
                          title={`${snap.timestamp} - ${snap.overall}`}
                          style={{
                            width: "6px",
                            height: "100%",
                            background: statusColor(snap.overall),
                            opacity: 0.8,
                          }}
                        />
                      )}
                    </For>
                  </div>
                </Card>
              </Stack>

              <Stack direction="vertical" gap="sm">
                <Text variant="h2">Recent Incidents</Text>
                <Show
                  when={d().history.some((s) => s.overall !== "ok")}
                  fallback={
                    <Card padding="md">
                      <Text variant="body">No incidents in the last 24 hours.</Text>
                    </Card>
                  }
                >
                  <For each={d().history.filter((s) => s.overall !== "ok").slice(-10)}>
                    {(snap) => (
                      <Card padding="sm">
                        <Text variant="body">{snap.timestamp} - {statusLabel(snap.overall)}</Text>
                      </Card>
                    )}
                  </For>
                </Show>
              </Stack>

              <Card padding="md">
                <Text variant="h3">Subscribe to updates</Text>
                <Text variant="body">Email subscription coming soon.</Text>
              </Card>
            </>
          )}
        </Show>
      </Stack>
    </>
  );
}
