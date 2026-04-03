// ── Route Analytics ─────────────────────────────────────────────────
// Tracks page navigation patterns and builds a transition probability
// matrix from user navigation history. Stored in localStorage with a
// sliding window of the last 1000 navigations.

// ── Types ────────────────────────────────────────────────────────────

export interface NavigationEntry {
  from: string;
  to: string;
  timestamp: number;
}

export interface TransitionMatrix {
  /** Map of "from" route -> Map of "to" route -> count */
  counts: Record<string, Record<string, number>>;
  /** Total outgoing transitions from each route */
  totals: Record<string, number>;
}

export interface RouteScore {
  route: string;
  probability: number;
  count: number;
}

// ── Constants ────────────────────────────────────────────────────────

const STORAGE_KEY = "cronix:route-analytics";
const MAX_ENTRIES = 1000;

// ── Internal State ───────────────────────────────────────────────────

let entries: NavigationEntry[] = [];
let matrix: TransitionMatrix = { counts: {}, totals: {} };
let initialized = false;

// ── Persistence ──────────────────────────────────────────────────────

function loadFromStorage(): void {
  if (typeof globalThis.localStorage === "undefined") return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        entries = parsed as NavigationEntry[];
        rebuildMatrix();
      }
    }
  } catch {
    // Corrupted data — start fresh
    entries = [];
    matrix = { counts: {}, totals: {} };
  }
}

function saveToStorage(): void {
  if (typeof globalThis.localStorage === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — trim and retry
    entries = entries.slice(-Math.floor(MAX_ENTRIES / 2));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Give up silently — analytics is non-critical
    }
  }
}

// ── Matrix Operations ────────────────────────────────────────────────

function rebuildMatrix(): void {
  const counts: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};

  for (const entry of entries) {
    if (!counts[entry.from]) {
      counts[entry.from] = {};
    }
    counts[entry.from][entry.to] = (counts[entry.from][entry.to] ?? 0) + 1;
    totals[entry.from] = (totals[entry.from] ?? 0) + 1;
  }

  matrix = { counts, totals };
}

function ensureInitialized(): void {
  if (!initialized) {
    loadFromStorage();
    initialized = true;
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Record a navigation from one route to another.
 * Maintains a sliding window of the last MAX_ENTRIES navigations.
 */
export function recordNavigation(from: string, to: string): void {
  ensureInitialized();

  // Skip self-navigations
  if (from === to) return;

  const entry: NavigationEntry = {
    from,
    to,
    timestamp: Date.now(),
  };

  entries.push(entry);

  // Sliding window: trim to MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }

  // Update matrix incrementally (avoid full rebuild)
  if (!matrix.counts[from]) {
    matrix.counts[from] = {};
  }
  matrix.counts[from][to] = (matrix.counts[from][to] ?? 0) + 1;
  matrix.totals[from] = (matrix.totals[from] ?? 0) + 1;

  saveToStorage();
}

/**
 * Get the top N most likely next routes from the current route,
 * sorted by transition probability (descending).
 */
export function getTopNextRoutes(currentRoute: string, limit: number = 5): RouteScore[] {
  ensureInitialized();

  const routeCounts = matrix.counts[currentRoute];
  const total = matrix.totals[currentRoute];

  if (!routeCounts || !total || total === 0) {
    return [];
  }

  const scores: RouteScore[] = Object.entries(routeCounts).map(
    ([route, count]) => ({
      route,
      probability: count / total,
      count,
    }),
  );

  scores.sort((a, b) => b.probability - a.probability);

  return scores.slice(0, limit);
}

/**
 * Get the transition probability from one route to another.
 * Returns 0 if no data exists for the transition.
 */
export function getTransitionProbability(from: string, to: string): number {
  ensureInitialized();

  const total = matrix.totals[from];
  if (!total || total === 0) return 0;

  const count = matrix.counts[from]?.[to];
  if (!count) return 0;

  return count / total;
}

/**
 * Get the full transition matrix (for debugging / optimization analysis).
 */
export function getTransitionMatrix(): TransitionMatrix {
  ensureInitialized();
  return { ...matrix };
}

/**
 * Get all recorded navigation entries (for debugging / export).
 */
export function getNavigationHistory(): readonly NavigationEntry[] {
  ensureInitialized();
  return entries;
}

/**
 * Clear all analytics data.
 */
export function clearAnalytics(): void {
  entries = [];
  matrix = { counts: {}, totals: {} };
  initialized = true;

  if (typeof globalThis.localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Non-critical
    }
  }
}

/**
 * Get all unique routes that have been visited.
 */
export function getAllKnownRoutes(): string[] {
  ensureInitialized();

  const routes = new Set<string>();
  for (const entry of entries) {
    routes.add(entry.from);
    routes.add(entry.to);
  }
  return Array.from(routes);
}

/**
 * Get visit count for a specific route (as destination).
 */
export function getRouteVisitCount(route: string): number {
  ensureInitialized();

  let count = 0;
  for (const entry of entries) {
    if (entry.to === route) {
      count++;
    }
  }
  return count;
}
