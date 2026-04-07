/**
 * Automated health monitoring.
 * Runs every 60 seconds, retains last 1000 checks, alerts via Sentinel.
 */
import { writeAudit } from "./audit-log";

export type ServiceStatus = "ok" | "degraded" | "down" | "unknown";

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs: number;
  detail?: string;
}

export interface HealthSnapshot {
  timestamp: string;
  overall: ServiceStatus;
  services: ServiceCheck[];
  memoryMb: number;
  uptimeSec: number;
}

const HISTORY_LIMIT = 1000;
const history: HealthSnapshot[] = [];
let monitorTimer: ReturnType<typeof setInterval> | null = null;
const startedAt = Date.now();

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { value, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

async function checkDb(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    const { db } = await import("@back-to-the-future/db");
    if (db.run) await db.run("SELECT 1");
  });
  return {
    name: "database",
    status: r.error ? "down" : r.latencyMs > 500 ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    ...(r.error !== undefined ? { detail: r.error } : {}),
  };
}

async function checkQdrant(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    const mod = await import("@back-to-the-future/ai-core");
    if (typeof mod.checkQdrantHealth === "function") await mod.checkQdrantHealth();
  });
  return {
    name: "qdrant",
    status: r.error ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    ...(r.error !== undefined ? { detail: r.error } : {}),
  };
}

async function checkStripe(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    if (!process.env.STRIPE_SECRET_KEY) return;
    // Lightweight HEAD against api.stripe.com
    const res = await fetch("https://api.stripe.com/v1/charges?limit=1", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok && res.status !== 401) throw new Error(`stripe status ${res.status}`);
  });
  const stripeDetail = r.error ?? (process.env.STRIPE_SECRET_KEY ? undefined : "not configured");
  return {
    name: "stripe",
    status: r.error ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    ...(stripeDetail !== undefined ? { detail: stripeDetail } : {}),
  };
}

async function checkEmail(): Promise<ServiceCheck> {
  return {
    name: "email",
    status: process.env.RESEND_API_KEY ? "ok" : "degraded",
    latencyMs: 0,
    ...(process.env.RESEND_API_KEY ? {} : { detail: "no RESEND_API_KEY (console fallback)" }),
  };
}

async function checkSentinel(): Promise<ServiceCheck> {
  // Check if sentinel alerting is configured without importing the sentinel
  // service (which lives outside this package's rootDir).
  const configured = Boolean(
    process.env["SLACK_WEBHOOK_URL"] ?? process.env["DISCORD_WEBHOOK_URL"],
  );
  return {
    name: "sentinel",
    status: configured ? "ok" : "degraded",
    latencyMs: 0,
    ...(configured ? {} : { detail: "no webhook configured" }),
  };
}

function checkMemory(): { mb: number; status: ServiceStatus } {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  return {
    mb: Math.round(used),
    status: used > 1500 ? "degraded" : "ok",
  };
}

async function alertIfDown(snapshot: HealthSnapshot): Promise<void> {
  const broken = snapshot.services.filter((s) => s.status === "down");
  if (broken.length === 0) return;
  try {
    const title = "Health monitor: services down";
    const body = broken.map((b) => `- ${b.name}: ${b.detail ?? b.status}`).join("\n");
    const payload = {
      priority: "critical" as const,
      title,
      body,
      timestamp: snapshot.timestamp,
    };

    // Send alerts inline — avoids cross-package imports outside rootDir.
    const slackWebhook = process.env["SLACK_WEBHOOK_URL"];
    const discordWebhook = process.env["DISCORD_WEBHOOK_URL"];
    await Promise.allSettled([
      slackWebhook
        ? fetch(slackWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `*[${payload.priority.toUpperCase()}]* ${payload.title}`,
              blocks: [
                {
                  type: "section",
                  text: { type: "mrkdwn", text: `*${payload.title}*\n${payload.body}` },
                },
              ],
            }),
          })
        : Promise.resolve(),
      discordWebhook
        ? fetch(discordWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: `**[${payload.priority.toUpperCase()}]** ${payload.title}\n${payload.body}`,
            }),
          })
        : Promise.resolve(),
    ]);
  } catch {
    // Alert sending failed - log via audit instead.
    await writeAudit({
      actorId: "system:health-monitor",
      action: "UPDATE",
      resourceType: "alert",
      resourceId: snapshot.timestamp,
      detail: `down: ${broken.map((b) => b.name).join(",")}`,
      result: "failure",
    });
  }
}

export async function runHealthCheck(): Promise<HealthSnapshot> {
  const [dbR, qdR, stR, emR, snR] = await Promise.all([
    checkDb(),
    checkQdrant(),
    checkStripe(),
    checkEmail(),
    checkSentinel(),
  ]);
  const mem = checkMemory();

  const services: ServiceCheck[] = [dbR, qdR, stR, emR, snR];
  const overall: ServiceStatus = services.some((s) => s.status === "down")
    ? "down"
    : services.some((s) => s.status === "degraded")
      ? "degraded"
      : "ok";

  const snapshot: HealthSnapshot = {
    timestamp: new Date().toISOString(),
    overall,
    services,
    memoryMb: mem.mb,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  };

  history.push(snapshot);
  if (history.length > HISTORY_LIMIT) history.shift();

  await alertIfDown(snapshot);

  return snapshot;
}

export function getCurrentHealth(): HealthSnapshot | null {
  return history[history.length - 1] ?? null;
}

export function getHealthHistory(): HealthSnapshot[] {
  return [...history];
}

export function startHealthMonitor(intervalMs = 60_000): void {
  if (monitorTimer) return;
  // Kick off immediately so the first snapshot is available.
  runHealthCheck().catch((err) => console.warn("[health-monitor] initial check error:", err));
  monitorTimer = setInterval(() => {
    runHealthCheck().catch((err) => console.warn("[health-monitor] error:", err));
  }, intervalMs);
}

export function stopHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
