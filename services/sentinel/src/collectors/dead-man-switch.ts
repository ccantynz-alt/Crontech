import type {
  CollectorStatus,
  DeadManSwitchConfig,
} from "../schemas/index.js";

/**
 * Dead-man's switch for sentinel collectors.
 *
 * Tracks the last successful run time for each collector and fires an
 * alert callback when any collector goes silent longer than the
 * configured maximum silence period. This catches silent failures --
 * cron jobs that stop running, workers that timeout, API endpoints
 * that silently return empty responses.
 *
 * Usage:
 *   const dms = new DeadManSwitch({ maxSilenceMs: 12h, checkIntervalMs: 15m });
 *   dms.onAlert((statuses) => sendSlackAlert(...));
 *   dms.recordSuccess("github-releases");
 *   dms.start();
 */
export class DeadManSwitch {
  private readonly config: DeadManSwitchConfig;
  private readonly statuses: Map<string, CollectorStatus> = new Map();
  private readonly alertCallbacks: Array<
    (unhealthy: CollectorStatus[]) => void | Promise<void>
  > = [];
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: DeadManSwitchConfig) {
    this.config = config;
  }

  /**
   * Register a collector to be monitored. Must be called before start()
   * for each collector that should be tracked.
   */
  registerCollector(name: string): void {
    const now = new Date().toISOString();
    this.statuses.set(name, {
      collectorName: name,
      lastRunAt: now,
      lastSuccessAt: undefined,
      consecutiveFailures: 0,
      isHealthy: true,
    });
  }

  /**
   * Record a successful run for a collector. Resets failure count
   * and updates timestamps.
   */
  recordSuccess(collectorName: string): void {
    const now = new Date().toISOString();

    this.statuses.set(collectorName, {
      collectorName,
      lastRunAt: now,
      lastSuccessAt: now,
      consecutiveFailures: 0,
      isHealthy: true,
    });
  }

  /**
   * Record a failed run for a collector. Increments failure count.
   */
  recordFailure(collectorName: string): void {
    const now = new Date().toISOString();
    const existing = this.statuses.get(collectorName);
    const failures = (existing?.consecutiveFailures ?? 0) + 1;

    this.statuses.set(collectorName, {
      collectorName,
      lastRunAt: now,
      lastSuccessAt: existing?.lastSuccessAt,
      consecutiveFailures: failures,
      isHealthy: false,
    });
  }

  /**
   * Register a callback to be invoked when unhealthy collectors are detected.
   */
  onAlert(
    callback: (unhealthy: CollectorStatus[]) => void | Promise<void>,
  ): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Check all registered collectors for health.
   * Returns collectors that have exceeded the silence threshold.
   */
  check(): CollectorStatus[] {
    const now = Date.now();
    const unhealthy: CollectorStatus[] = [];

    for (const [, status] of this.statuses) {
      const lastSuccess = status.lastSuccessAt
        ? new Date(status.lastSuccessAt).getTime()
        : 0;
      const silenceDuration = now - lastSuccess;

      if (silenceDuration > this.config.maxSilenceMs) {
        const updated: CollectorStatus = {
          ...status,
          isHealthy: false,
        };
        this.statuses.set(status.collectorName, updated);
        unhealthy.push(updated);
      }
    }

    return unhealthy;
  }

  /**
   * Run a health check and fire alert callbacks if unhealthy collectors
   * are detected.
   */
  private async runCheck(): Promise<void> {
    const unhealthy = this.check();

    if (unhealthy.length > 0) {
      console.warn(
        `[sentinel] Dead-man's switch: ${unhealthy.length.toString()} unhealthy collector(s): ${unhealthy.map((s) => s.collectorName).join(", ")}`,
      );

      for (const callback of this.alertCallbacks) {
        try {
          await callback(unhealthy);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[sentinel] Dead-man's switch: alert callback failed — ${message}`,
          );
        }
      }
    }
  }

  /**
   * Start the periodic health check. Returns a cleanup function.
   */
  start(): () => void {
    console.log(
      `[sentinel] Dead-man's switch started. Check interval: ${(this.config.checkIntervalMs / 1000 / 60).toFixed(0)} min, max silence: ${(this.config.maxSilenceMs / 1000 / 60 / 60).toFixed(1)} hours`,
    );
    console.log(
      `[sentinel] Monitoring ${this.statuses.size.toString()} collector(s): ${Array.from(this.statuses.keys()).join(", ")}`,
    );

    this.checkTimer = setInterval(() => {
      void this.runCheck();
    }, this.config.checkIntervalMs);

    return (): void => {
      if (this.checkTimer !== null) {
        clearInterval(this.checkTimer);
        this.checkTimer = null;
      }
    };
  }

  /**
   * Get the current status of all registered collectors.
   */
  getStatuses(): CollectorStatus[] {
    return Array.from(this.statuses.values());
  }

  /**
   * Get the status of a specific collector.
   */
  getStatus(collectorName: string): CollectorStatus | undefined {
    return this.statuses.get(collectorName);
  }
}
