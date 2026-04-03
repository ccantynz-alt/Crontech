// ── Navigation Analytics ─────────────────────────────────────────────
// Records page visits, time on page, and navigation flows. Feeds data
// to the route optimizer for learning. Privacy-respecting: no PII is
// collected or stored. Fully SSR-safe.

import { trackNavigation } from "../route-optimizer";
import { trackDataAccess } from "../data-prefetcher";

// ── Storage ─────────────────────────────────────────────────────────

const STORAGE_KEY = "btf:nav-analytics";

/** Aggregated per-route metrics (no PII, no timestamps with user identity). */
interface RouteMetrics {
  /** Total number of visits to this route. */
  visits: number;
  /** Cumulative time spent on this route in milliseconds. */
  totalTimeMs: number;
  /** Average time spent on this route in milliseconds. */
  avgTimeMs: number;
}

type MetricsMap = Record<string, RouteMetrics>;

/** In-flight visit being tracked. */
interface ActiveVisit {
  route: string;
  startedAt: number;
}

let metrics: MetricsMap = {};
let metricsLoaded = false;
let activeVisit: ActiveVisit | undefined;

// ── Persistence ─────────────────────────────────────────────────────

function loadMetrics(): void {
  if (metricsLoaded) return;
  metricsLoaded = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      metrics = JSON.parse(raw) as MetricsMap;
    }
  } catch {
    metrics = {};
  }
}

function persistMetrics(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    // Storage full or unavailable -- silently ignore.
  }
}

// ── Internal Helpers ────────────────────────────────────────────────

function finalizeActiveVisit(): void {
  if (activeVisit === undefined) return;

  const elapsed = Date.now() - activeVisit.startedAt;
  const route = activeVisit.route;

  loadMetrics();

  const existing = metrics[route];
  if (existing) {
    existing.visits += 1;
    existing.totalTimeMs += elapsed;
    existing.avgTimeMs = Math.round(existing.totalTimeMs / existing.visits);
  } else {
    metrics[route] = {
      visits: 1,
      totalTimeMs: elapsed,
      avgTimeMs: elapsed,
    };
  }

  persistMetrics();
  activeVisit = undefined;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Record a page visit. Call when the user navigates to a new route.
 * Automatically finalizes the previous visit and feeds the transition
 * to the route optimizer so it can learn navigation patterns.
 */
export function recordPageVisit(route: string): void {
  const previousRoute = activeVisit?.route;

  // Finalize the previous visit (records time-on-page).
  finalizeActiveVisit();

  // Feed the transition to the route optimizer for pattern learning.
  if (previousRoute !== undefined && previousRoute !== route) {
    trackNavigation(previousRoute, route);
  }

  // Start tracking the new visit.
  activeVisit = { route, startedAt: Date.now() };
}

/**
 * Record that a tRPC procedure was accessed on the current route.
 * Delegates to the data prefetcher for learning data access patterns.
 */
export function recordDataAccess(procedure: string): void {
  if (activeVisit === undefined) return;
  trackDataAccess(activeVisit.route, procedure);
}

/**
 * Get aggregated metrics for a specific route. Returns undefined if
 * no data has been recorded for that route.
 */
export function getRouteMetrics(route: string): RouteMetrics | undefined {
  loadMetrics();
  return metrics[route];
}

/**
 * Get aggregated metrics for all recorded routes.
 */
export function getAllRouteMetrics(): Readonly<MetricsMap> {
  loadMetrics();
  return metrics;
}

/**
 * Get the route the user is currently on, if tracking is active.
 */
export function getCurrentRoute(): string | undefined {
  return activeVisit?.route;
}

/**
 * Finalize the current visit. Call on page unload or when the app
 * is being torn down, to ensure time-on-page is recorded.
 */
export function flushActiveVisit(): void {
  finalizeActiveVisit();
}

/**
 * Clear all analytics data. Useful for testing or user-initiated reset.
 */
export function resetAnalytics(): void {
  metrics = {};
  metricsLoaded = true;
  activeVisit = undefined;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
}
