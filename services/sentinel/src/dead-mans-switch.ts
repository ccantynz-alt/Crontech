import { type AlertMessage, sendSlackAlert, sendDiscordAlert } from "./alerts/types";

interface CollectorStatus {
  name: string;
  lastSuccess: number;
  expectedIntervalMs: number;
}

const collectorStatuses = new Map<string, CollectorStatus>();

export function reportSuccess(name: string, expectedIntervalMs: number): void {
  collectorStatuses.set(name, {
    name,
    lastSuccess: Date.now(),
    expectedIntervalMs,
  });
}

export function checkDeadMansSwitch(): string[] {
  const now = Date.now();
  const deadCollectors: string[] = [];

  for (const [name, status] of collectorStatuses) {
    const threshold = status.expectedIntervalMs * 2;
    if (now - status.lastSuccess > threshold) {
      deadCollectors.push(name);
    }
  }

  return deadCollectors;
}

export async function runDeadMansSwitch(): Promise<void> {
  const dead = checkDeadMansSwitch();

  if (dead.length > 0) {
    const alert: AlertMessage = {
      priority: "critical",
      title: `DEAD MAN'S SWITCH: ${dead.length} collector(s) stopped reporting`,
      body: `The following collectors have not reported in 2x their expected interval:\n${dead.map((d) => `- ${d}`).join("\n")}`,
      timestamp: new Date().toISOString(),
    };

    console.error(`[sentinel:dead-mans-switch] ALERT: ${dead.join(", ")}`);
    await sendSlackAlert(alert);
    await sendDiscordAlert(alert);
  }
}
