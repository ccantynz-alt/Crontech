// ── AI Route Optimizer ──────────────────────────────────────────────
// Analyzes navigation patterns from route analytics to suggest route
// restructuring. Identifies hot paths, dead routes, and generates
// optimization reports.

import {
  getAllKnownRoutes,
  getNavigationHistory,
  getTopNextRoutes,
  getTransitionMatrix,
  getRouteVisitCount,
} from "./route-analytics";
import type { NavigationEntry, RouteScore } from "./route-analytics";

// ── Types ────────────────────────────────────────────────────────────

export interface HotPath {
  /** Ordered sequence of routes in this hot path */
  sequence: string[];
  /** Number of times this exact sequence was traversed */
  frequency: number;
  /** Average time between navigations in the sequence (ms) */
  avgTransitionTime: number;
}

export interface DeadRoute {
  /** The route path */
  route: string;
  /** Total visits to this route */
  visitCount: number;
  /** When the route was last visited (timestamp), or null if never */
  lastVisited: number | null;
}

export interface RouteCluster {
  /** Routes that are frequently navigated between */
  routes: string[];
  /** Total transitions within this cluster */
  internalTransitions: number;
  /** Suggested grouping name based on common prefix */
  suggestedGroup: string;
}

export interface OptimizationSuggestion {
  type: "merge" | "reorder" | "prefetch" | "lazy-load" | "remove";
  description: string;
  routes: string[];
  impact: "high" | "medium" | "low";
}

export interface RouteOptimizationReport {
  /** When this report was generated */
  generatedAt: number;
  /** Total navigations analyzed */
  totalNavigations: number;
  /** Total unique routes discovered */
  totalRoutes: number;
  /** Most frequently traversed route sequences (length 2-4) */
  hotPaths: HotPath[];
  /** Routes with very low or zero traffic */
  deadRoutes: DeadRoute[];
  /** Groups of routes frequently navigated between */
  clusters: RouteCluster[];
  /** Actionable optimization suggestions */
  suggestions: OptimizationSuggestion[];
  /** Top entry points (first routes in sessions) */
  topEntryPoints: RouteScore[];
  /** Top exit points (last routes before leaving) */
  topExitPoints: RouteScore[];
}

// ── Internal Helpers ─────────────────────────────────────────────────

/**
 * Extract sequences of length `len` from navigation history.
 */
function extractSequences(
  history: readonly NavigationEntry[],
  len: number,
): Map<string, { count: number; totalTime: number }> {
  const sequences = new Map<string, { count: number; totalTime: number }>();

  for (let i = 0; i <= history.length - len; i++) {
    const slice = history.slice(i, i + len);

    // Ensure the sequence is contiguous (each entry.to === next entry.from)
    let contiguous = true;
    for (let j = 0; j < slice.length - 1; j++) {
      if (slice[j].to !== slice[j + 1].from) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;

    // Build sequence key: from -> to1 -> to2 -> ...
    const routes = [slice[0].from];
    for (const entry of slice) {
      routes.push(entry.to);
    }
    const key = routes.join(" -> ");

    const totalTime = slice[slice.length - 1].timestamp - slice[0].timestamp;
    const existing = sequences.get(key);
    if (existing) {
      existing.count++;
      existing.totalTime += totalTime;
    } else {
      sequences.set(key, { count: 1, totalTime });
    }
  }

  return sequences;
}

/**
 * Find common prefix among a set of route paths.
 */
function findCommonPrefix(routes: string[]): string {
  if (routes.length === 0) return "/";
  if (routes.length === 1) return routes[0];

  const segments = routes.map((r) => r.split("/").filter(Boolean));
  const common: string[] = [];

  for (let i = 0; i < segments[0].length; i++) {
    const segment = segments[0][i];
    if (segments.every((s) => s[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.length > 0 ? `/${common.join("/")}` : "/";
}

/**
 * Identify clusters of routes that are frequently navigated between.
 */
function identifyClusters(
  routes: string[],
  matrix: ReturnType<typeof getTransitionMatrix>,
): RouteCluster[] {
  const clusters: RouteCluster[] = [];
  const visited = new Set<string>();

  for (const route of routes) {
    if (visited.has(route)) continue;

    const cluster = [route];
    visited.add(route);

    // Find routes with strong bidirectional connections
    const topNext = getTopNextRoutes(route, 10);
    for (const next of topNext) {
      if (visited.has(next.route)) continue;
      if (next.probability < 0.2) continue;

      // Check if the reverse connection also exists
      const reverseTotal = matrix.totals[next.route] ?? 0;
      const reverseCount = matrix.counts[next.route]?.[route] ?? 0;
      const reverseProbability = reverseTotal > 0 ? reverseCount / reverseTotal : 0;

      if (reverseProbability >= 0.15) {
        cluster.push(next.route);
        visited.add(next.route);
      }
    }

    if (cluster.length >= 2) {
      let internalTransitions = 0;
      for (const from of cluster) {
        for (const to of cluster) {
          if (from !== to) {
            internalTransitions += matrix.counts[from]?.[to] ?? 0;
          }
        }
      }

      clusters.push({
        routes: cluster,
        internalTransitions,
        suggestedGroup: findCommonPrefix(cluster),
      });
    }
  }

  // Sort by internal transitions (most active clusters first)
  clusters.sort((a, b) => b.internalTransitions - a.internalTransitions);

  return clusters;
}

/**
 * Generate optimization suggestions based on analysis.
 */
function generateSuggestions(
  hotPaths: HotPath[],
  deadRoutes: DeadRoute[],
  clusters: RouteCluster[],
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Suggest prefetching for hot paths
  for (const hotPath of hotPaths.slice(0, 5)) {
    if (hotPath.frequency >= 5) {
      suggestions.push({
        type: "prefetch",
        description: `High-traffic path: ${hotPath.sequence.join(" -> ")}. Configure aggressive prefetching for this sequence.`,
        routes: hotPath.sequence,
        impact: hotPath.frequency >= 20 ? "high" : "medium",
      });
    }
  }

  // Suggest removal or lazy-loading for dead routes
  for (const dead of deadRoutes) {
    if (dead.visitCount === 0) {
      suggestions.push({
        type: "remove",
        description: `Route "${dead.route}" has zero visits. Consider removing or redirecting.`,
        routes: [dead.route],
        impact: "low",
      });
    } else if (dead.visitCount <= 2) {
      suggestions.push({
        type: "lazy-load",
        description: `Route "${dead.route}" has very low traffic (${dead.visitCount} visits). Ensure it is lazy-loaded.`,
        routes: [dead.route],
        impact: "low",
      });
    }
  }

  // Suggest grouping for clusters
  for (const cluster of clusters.slice(0, 3)) {
    if (cluster.routes.length >= 3) {
      suggestions.push({
        type: "merge",
        description: `Routes ${cluster.routes.join(", ")} form a navigation cluster (${cluster.internalTransitions} transitions). Consider grouping under "${cluster.suggestedGroup}" for code-splitting.`,
        routes: cluster.routes,
        impact: cluster.internalTransitions >= 20 ? "high" : "medium",
      });
    }
  }

  // Sort by impact
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  return suggestions;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Analyze route navigation patterns and generate an optimization report.
 * This is the primary export — call it to get a full analysis of
 * navigation behavior with actionable suggestions.
 */
export function analyzeRoutes(): RouteOptimizationReport {
  const history = getNavigationHistory();
  const routes = getAllKnownRoutes();
  const matrix = getTransitionMatrix();

  // Extract hot paths (sequences of 2-4 navigations)
  const hotPaths: HotPath[] = [];
  for (let len = 1; len <= 3; len++) {
    const sequences = extractSequences(history, len);
    for (const [key, data] of sequences) {
      if (data.count >= 3) {
        hotPaths.push({
          sequence: key.split(" -> "),
          frequency: data.count,
          avgTransitionTime: data.count > 0 ? data.totalTime / data.count : 0,
        });
      }
    }
  }
  hotPaths.sort((a, b) => b.frequency - a.frequency);

  // Identify dead routes (bottom 20% by visit count, or zero visits)
  const routeVisits = routes.map((route) => ({
    route,
    visitCount: getRouteVisitCount(route),
    lastVisited: null as number | null,
  }));

  // Find last visit timestamps
  for (const rv of routeVisits) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].to === rv.route) {
        rv.lastVisited = history[i].timestamp;
        break;
      }
    }
  }

  routeVisits.sort((a, b) => a.visitCount - b.visitCount);
  const deadThreshold = Math.max(3, Math.floor(history.length * 0.02));
  const deadRoutes = routeVisits.filter((rv) => rv.visitCount <= deadThreshold);

  // Identify route clusters
  const clusters = identifyClusters(routes, matrix);

  // Generate suggestions
  const suggestions = generateSuggestions(hotPaths.slice(0, 20), deadRoutes, clusters);

  // Top entry points (routes that appear as "to" without a matching "from" in prior entry)
  const entryPointCounts: Record<string, number> = {};
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    // If this is the first entry or there is a time gap > 30 minutes
    const isNewSession =
      i === 0 ||
      entry.timestamp - history[i - 1].timestamp > 30 * 60 * 1000;
    if (isNewSession) {
      entryPointCounts[entry.from] = (entryPointCounts[entry.from] ?? 0) + 1;
    }
  }
  const totalSessions = Object.values(entryPointCounts).reduce((a, b) => a + b, 0);
  const topEntryPoints: RouteScore[] = Object.entries(entryPointCounts)
    .map(([route, count]) => ({
      route,
      probability: totalSessions > 0 ? count / totalSessions : 0,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top exit points (last route before a session gap)
  const exitPointCounts: Record<string, number> = {};
  for (let i = 0; i < history.length; i++) {
    const isLastEntry = i === history.length - 1;
    const isEndOfSession =
      isLastEntry ||
      history[i + 1].timestamp - history[i].timestamp > 30 * 60 * 1000;
    if (isEndOfSession) {
      exitPointCounts[history[i].to] = (exitPointCounts[history[i].to] ?? 0) + 1;
    }
  }
  const totalExitSessions = Object.values(exitPointCounts).reduce((a, b) => a + b, 0);
  const topExitPoints: RouteScore[] = Object.entries(exitPointCounts)
    .map(([route, count]) => ({
      route,
      probability: totalExitSessions > 0 ? count / totalExitSessions : 0,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    generatedAt: Date.now(),
    totalNavigations: history.length,
    totalRoutes: routes.length,
    hotPaths: hotPaths.slice(0, 20),
    deadRoutes,
    clusters,
    suggestions,
    topEntryPoints,
    topExitPoints,
  };
}
