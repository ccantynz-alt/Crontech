import { z } from "zod";
import { sendSlackAlert } from "./slack-webhook.js";

// --- Zod Schemas ---

export const CollectorStatusSchema = z.object({
  collectorId: z.string(),
  lastCheckin: z.number().describe("Unix timestamp ms of last check-in"),
  expectedIntervalMs: z.number().positive(),
  isOverdue: z.boolean(),
  overdueByMs: z.number(),
});

export type CollectorStatus = z.infer<typeof CollectorStatusSchema>;

export const DeadManSwitchStatusSchema = z.object({
  collectors: z.array(CollectorStatusSchema),
  allHealthy: z.boolean(),
  overdueCollectors: z.array(z.string()),
  checkedAt: z.string().datetime(),
});

export type DeadManSwitchStatus = z.infer<typeof DeadManSwitchStatusSchema>;

// --- Default expected intervals ---

export const DEFAULT_INTERVALS: Record<string, number> = {
  github: 60 * 60 * 1000, // 1 hour
  npm: 60 * 60 * 1000, // 1 hour
  hackernews: 6 * 60 * 60 * 1000, // 6 hours
  arxiv: 6 * 60 * 60 * 1000, // 6 hours
};

/**
 * Dead Man's Switch for monitoring collector health.
 *
 * Tracks heartbeats from each collector. If any collector misses its
 * expected check-in window, fires an alert. No silent failures.
 */
export class DeadManSwitch {
  private checkins: Map<string, number> = new Map();
  private intervals: Map<string, number> = new Map();
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private alertCallback:
    | ((overdueCollectors: string[]) => Promise<void>)
    | null = null;

  constructor(
    collectorIntervals: Record<string, number> = DEFAULT_INTERVALS,
  ) {
    for (const [id, interval] of Object.entries(collectorIntervals)) {
      this.intervals.set(id, interval);
      // Initialize with current time so we don't alert immediately on startup
      this.checkins.set(id, Date.now());
    }
  }

  /**
   * Register a check-in from a collector. Call this after each successful collection run.
   */
  checkin(collectorId: string): void {
    z.string().min(1).parse(collectorId);
    this.checkins.set(collectorId, Date.now());
  }

  /**
   * Register a new collector to track.
   */
  registerCollector(collectorId: string, expectedIntervalMs: number): void {
    z.string().min(1).parse(collectorId);
    z.number().positive().parse(expectedIntervalMs);
    this.intervals.set(collectorId, expectedIntervalMs);
    this.checkins.set(collectorId, Date.now());
  }

  /**
   * Get the current status of all tracked collectors.
   */
  getStatus(): DeadManSwitchStatus {
    const now = Date.now();
    const collectors: CollectorStatus[] = [];
    const overdueCollectors: string[] = [];

    for (const [id, interval] of this.intervals.entries()) {
      const lastCheckin = this.checkins.get(id) ?? 0;
      const elapsed = now - lastCheckin;
      // Allow 50% grace period beyond expected interval
      const gracePeriod = interval * 1.5;
      const isOverdue = elapsed > gracePeriod;
      const overdueByMs = isOverdue ? elapsed - interval : 0;

      if (isOverdue) {
        overdueCollectors.push(id);
      }

      collectors.push({
        collectorId: id,
        lastCheckin,
        expectedIntervalMs: interval,
        isOverdue,
        overdueByMs,
      });
    }

    return DeadManSwitchStatusSchema.parse({
      collectors,
      allHealthy: overdueCollectors.length === 0,
      overdueCollectors,
      checkedAt: new Date().toISOString(),
    });
  }

  /**
   * Set a custom alert callback. Called with the list of overdue collector IDs.
   */
  onAlert(
    callback: (overdueCollectors: string[]) => Promise<void>,
  ): void {
    this.alertCallback = callback;
  }

  /**
   * Start continuous monitoring. Checks collector health at the specified interval.
   * Fires alerts for any overdue collectors.
   */
  startMonitoring(intervalMs: number = 60_000): void {
    z.number().positive().parse(intervalMs);

    if (this.monitorTimer !== null) {
      this.stopMonitoring();
    }

    this.monitorTimer = setInterval(async () => {
      const status = this.getStatus();

      if (!status.allHealthy) {
        if (this.alertCallback) {
          await this.alertCallback(status.overdueCollectors);
        } else {
          // Default: send to Slack
          await sendSlackAlert(
            "#sentinel-critical",
            `Dead Man's Switch triggered! Overdue collectors: ${status.overdueCollectors.join(", ")}. These collectors have not reported in within their expected interval. Investigate immediately.`,
            "critical",
          );
        }
      }
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring.
   */
  stopMonitoring(): void {
    if (this.monitorTimer !== null) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Check if monitoring is currently active.
   */
  isMonitoring(): boolean {
    return this.monitorTimer !== null;
  }
}
