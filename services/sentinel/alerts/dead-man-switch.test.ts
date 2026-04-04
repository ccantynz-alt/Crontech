import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { DeadManSwitch, DEFAULT_INTERVALS } from "./dead-man-switch.js";

describe("DeadManSwitch", () => {
  let dms: DeadManSwitch;

  beforeEach(() => {
    dms = new DeadManSwitch({
      github: 1000, // 1 second for testing
      npm: 2000, // 2 seconds for testing
    });
  });

  afterEach(() => {
    dms.stopMonitoring();
  });

  describe("constructor", () => {
    it("should initialize with default intervals", () => {
      const defaultDms = new DeadManSwitch();
      const status = defaultDms.getStatus();
      expect(status.collectors.length).toBe(
        Object.keys(DEFAULT_INTERVALS).length,
      );
      expect(status.allHealthy).toBe(true);
    });

    it("should initialize with custom intervals", () => {
      const status = dms.getStatus();
      expect(status.collectors).toHaveLength(2);
      expect(status.allHealthy).toBe(true);
    });
  });

  describe("checkin", () => {
    it("should update last check-in time", () => {
      const before = Date.now();
      dms.checkin("github");
      const status = dms.getStatus();
      const githubCollector = status.collectors.find(
        (c) => c.collectorId === "github",
      );
      expect(githubCollector).toBeDefined();
      expect(githubCollector!.lastCheckin).toBeGreaterThanOrEqual(before);
    });

    it("should accept check-ins for unknown collectors", () => {
      // Unknown collectors are tracked in checkins map but have no interval
      dms.checkin("unknown-collector");
      // Should not throw
    });

    it("should reject empty collector ID", () => {
      expect(() => dms.checkin("")).toThrow();
    });
  });

  describe("registerCollector", () => {
    it("should add a new collector to tracking", () => {
      dms.registerCollector("arxiv", 5000);
      const status = dms.getStatus();
      expect(status.collectors).toHaveLength(3);
      const arxiv = status.collectors.find((c) => c.collectorId === "arxiv");
      expect(arxiv).toBeDefined();
      expect(arxiv!.expectedIntervalMs).toBe(5000);
    });

    it("should reject invalid interval", () => {
      expect(() => dms.registerCollector("test", -1)).toThrow();
      expect(() => dms.registerCollector("test", 0)).toThrow();
    });
  });

  describe("getStatus", () => {
    it("should report all healthy when recently checked in", () => {
      dms.checkin("github");
      dms.checkin("npm");
      const status = dms.getStatus();
      expect(status.allHealthy).toBe(true);
      expect(status.overdueCollectors).toHaveLength(0);
    });

    it("should detect overdue collectors", async () => {
      // Create a switch with very short interval
      const shortDms = new DeadManSwitch({
        fast: 10, // 10ms interval
      });

      // Wait for it to become overdue (10ms * 1.5 grace = 15ms)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = shortDms.getStatus();
      expect(status.allHealthy).toBe(false);
      expect(status.overdueCollectors).toContain("fast");

      const fastCollector = status.collectors.find(
        (c) => c.collectorId === "fast",
      );
      expect(fastCollector!.isOverdue).toBe(true);
      expect(fastCollector!.overdueByMs).toBeGreaterThan(0);
    });

    it("should include correct checkedAt timestamp", () => {
      const before = new Date().toISOString();
      const status = dms.getStatus();
      expect(status.checkedAt).toBeTruthy();
      // checkedAt should be a valid ISO datetime
      expect(() => new Date(status.checkedAt)).not.toThrow();
    });

    it("should respect grace period (1.5x interval)", async () => {
      // 100ms interval with 1.5x grace = not overdue until 150ms
      const graceDms = new DeadManSwitch({
        test: 100,
      });

      // At 50ms should still be healthy
      await new Promise((resolve) => setTimeout(resolve, 50));
      let status = graceDms.getStatus();
      expect(status.allHealthy).toBe(true);

      // At 200ms should be overdue
      await new Promise((resolve) => setTimeout(resolve, 150));
      status = graceDms.getStatus();
      expect(status.allHealthy).toBe(false);
    });
  });

  describe("startMonitoring / stopMonitoring", () => {
    it("should start and stop monitoring", () => {
      expect(dms.isMonitoring()).toBe(false);
      dms.startMonitoring(100);
      expect(dms.isMonitoring()).toBe(true);
      dms.stopMonitoring();
      expect(dms.isMonitoring()).toBe(false);
    });

    it("should replace existing monitoring when started again", () => {
      dms.startMonitoring(100);
      expect(dms.isMonitoring()).toBe(true);
      dms.startMonitoring(200); // Should stop old and start new
      expect(dms.isMonitoring()).toBe(true);
      dms.stopMonitoring();
      expect(dms.isMonitoring()).toBe(false);
    });

    it("should fire alert callback when collectors are overdue", async () => {
      const alertedCollectors: string[] = [];

      const shortDms = new DeadManSwitch({
        fast: 10, // Very short interval for testing
      });

      shortDms.onAlert(async (overdue) => {
        alertedCollectors.push(...overdue);
      });

      // Wait for it to become overdue
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Start monitoring with short check interval
      shortDms.startMonitoring(20);

      // Wait for the monitor to fire
      await new Promise((resolve) => setTimeout(resolve, 60));

      shortDms.stopMonitoring();

      expect(alertedCollectors).toContain("fast");
    });

    it("should reject invalid interval", () => {
      expect(() => dms.startMonitoring(0)).toThrow();
      expect(() => dms.startMonitoring(-1)).toThrow();
    });
  });

  describe("onAlert", () => {
    it("should accept a custom alert callback", () => {
      const callback = async (_collectors: string[]): Promise<void> => {};
      // Should not throw
      dms.onAlert(callback);
    });
  });

  describe("DEFAULT_INTERVALS", () => {
    it("should have reasonable default intervals", () => {
      expect(DEFAULT_INTERVALS["github"]).toBe(60 * 60 * 1000); // 1 hour
      expect(DEFAULT_INTERVALS["npm"]).toBe(60 * 60 * 1000);
      expect(DEFAULT_INTERVALS["hackernews"]).toBe(6 * 60 * 60 * 1000); // 6 hours
      expect(DEFAULT_INTERVALS["arxiv"]).toBe(6 * 60 * 60 * 1000);
    });
  });
});
