import { describe, expect, it, beforeEach } from "bun:test";
import {
  recordNavigation,
  getTopNextRoutes,
  getTransitionProbability,
  getTransitionMatrix,
  getNavigationHistory,
  clearAnalytics,
  getAllKnownRoutes,
  getRouteVisitCount,
} from "../route-analytics";

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAnalytics();
});

// ── recordNavigation ─────────────────────────────────────────────────

describe("recordNavigation", () => {
  it("records a navigation and stores it in history", () => {
    recordNavigation("/", "/dashboard");
    const history = getNavigationHistory();
    expect(history.length).toBe(1);
    expect(history[0].from).toBe("/");
    expect(history[0].to).toBe("/dashboard");
    expect(typeof history[0].timestamp).toBe("number");
  });

  it("ignores self-navigations (from === to)", () => {
    recordNavigation("/dashboard", "/dashboard");
    expect(getNavigationHistory().length).toBe(0);
  });

  it("records multiple navigations in order", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/dashboard", "/settings");
    recordNavigation("/settings", "/");
    const history = getNavigationHistory();
    expect(history.length).toBe(3);
    expect(history[0].to).toBe("/dashboard");
    expect(history[1].to).toBe("/settings");
    expect(history[2].to).toBe("/");
  });

  it("updates the transition matrix incrementally", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/settings");
    const matrix = getTransitionMatrix();
    expect(matrix.counts["/"]["/dashboard"]).toBe(2);
    expect(matrix.counts["/"]["/settings"]).toBe(1);
    expect(matrix.totals["/"]).toBe(3);
  });
});

// ── getTopNextRoutes ─────────────────────────────────────────────────

describe("getTopNextRoutes", () => {
  it("returns empty array when no data exists", () => {
    const result = getTopNextRoutes("/unknown");
    expect(result).toEqual([]);
  });

  it("returns routes sorted by probability (descending)", () => {
    // 3 navigations to /dashboard, 2 to /settings, 1 to /profile
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/settings");
    recordNavigation("/", "/settings");
    recordNavigation("/", "/profile");

    const result = getTopNextRoutes("/");
    expect(result.length).toBe(3);
    expect(result[0].route).toBe("/dashboard");
    expect(result[0].probability).toBe(3 / 6);
    expect(result[1].route).toBe("/settings");
    expect(result[1].probability).toBe(2 / 6);
    expect(result[2].route).toBe("/profile");
    expect(result[2].probability).toBe(1 / 6);
  });

  it("respects the limit parameter", () => {
    recordNavigation("/", "/a");
    recordNavigation("/", "/b");
    recordNavigation("/", "/c");
    recordNavigation("/", "/d");

    const result = getTopNextRoutes("/", 2);
    expect(result.length).toBe(2);
  });

  it("returns correct counts", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/settings");

    const result = getTopNextRoutes("/");
    const dashboard = result.find((r) => r.route === "/dashboard");
    expect(dashboard?.count).toBe(2);
    const settings = result.find((r) => r.route === "/settings");
    expect(settings?.count).toBe(1);
  });
});

// ── getTransitionProbability ─────────────────────────────────────────

describe("getTransitionProbability", () => {
  it("returns 0 when no data exists for the from route", () => {
    expect(getTransitionProbability("/unknown", "/anywhere")).toBe(0);
  });

  it("returns 0 when no transition exists between specific routes", () => {
    recordNavigation("/", "/dashboard");
    expect(getTransitionProbability("/", "/settings")).toBe(0);
  });

  it("returns correct probability for recorded transitions", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/settings");

    expect(getTransitionProbability("/", "/dashboard")).toBeCloseTo(2 / 3);
    expect(getTransitionProbability("/", "/settings")).toBeCloseTo(1 / 3);
  });

  it("returns 1.0 when all transitions go to the same route", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/dashboard");

    expect(getTransitionProbability("/", "/dashboard")).toBe(1);
  });
});

// ── getTransitionMatrix ──────────────────────────────────────────────

describe("getTransitionMatrix", () => {
  it("returns empty matrix initially", () => {
    const matrix = getTransitionMatrix();
    expect(Object.keys(matrix.counts)).toHaveLength(0);
    expect(Object.keys(matrix.totals)).toHaveLength(0);
  });

  it("tracks multiple source routes independently", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/dashboard", "/settings");
    recordNavigation("/dashboard", "/profile");

    const matrix = getTransitionMatrix();
    expect(matrix.totals["/"]).toBe(1);
    expect(matrix.totals["/dashboard"]).toBe(2);
    expect(matrix.counts["/"]["/dashboard"]).toBe(1);
    expect(matrix.counts["/dashboard"]["/settings"]).toBe(1);
    expect(matrix.counts["/dashboard"]["/profile"]).toBe(1);
  });
});

// ── getAllKnownRoutes ────────────────────────────────────────────────

describe("getAllKnownRoutes", () => {
  it("returns empty array when no data exists", () => {
    expect(getAllKnownRoutes()).toEqual([]);
  });

  it("returns all unique routes (both from and to)", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/dashboard", "/settings");

    const routes = getAllKnownRoutes();
    expect(routes).toContain("/");
    expect(routes).toContain("/dashboard");
    expect(routes).toContain("/settings");
    expect(routes.length).toBe(3);
  });
});

// ── getRouteVisitCount ───────────────────────────────────────────────

describe("getRouteVisitCount", () => {
  it("returns 0 for unvisited routes", () => {
    expect(getRouteVisitCount("/unknown")).toBe(0);
  });

  it("counts visits correctly (as destination)", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/settings", "/dashboard");
    recordNavigation("/profile", "/dashboard");
    recordNavigation("/", "/settings");

    expect(getRouteVisitCount("/dashboard")).toBe(3);
    expect(getRouteVisitCount("/settings")).toBe(1);
  });
});

// ── clearAnalytics ───────────────────────────────────────────────────

describe("clearAnalytics", () => {
  it("clears all data", () => {
    recordNavigation("/", "/dashboard");
    recordNavigation("/", "/settings");

    clearAnalytics();

    expect(getNavigationHistory().length).toBe(0);
    expect(getAllKnownRoutes().length).toBe(0);
    expect(getTransitionProbability("/", "/dashboard")).toBe(0);
  });
});

// ── Sliding Window ───────────────────────────────────────────────────

describe("sliding window", () => {
  it("trims entries when exceeding MAX_ENTRIES (1000)", () => {
    // Record 1010 entries
    for (let i = 0; i < 1010; i++) {
      recordNavigation(`/page-${i}`, `/page-${i + 1}`);
    }

    const history = getNavigationHistory();
    expect(history.length).toBeLessThanOrEqual(1000);
  });
});
