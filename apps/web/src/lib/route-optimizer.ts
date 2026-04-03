// ── AI-Driven Route Optimizer ────────────────────────────────────────
// Tracks page visit patterns and predicts likely next routes based on
// historical navigation behavior. Persists patterns to localStorage
// across sessions. Fully SSR-safe.

const STORAGE_KEY = "btf:route-patterns";

/** Navigation frequency map: fromRoute -> { toRoute -> visitCount } */
type PatternMap = Record<string, Record<string, number>>;

let patterns: PatternMap = {};
let loaded = false;

// ── Persistence ─────────────────────────────────────────────────────

function loadPatterns(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      patterns = JSON.parse(raw) as PatternMap;
    }
  } catch {
    // Corrupt or unavailable storage — start fresh.
    patterns = {};
  }
}

function persistPatterns(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Record a navigation event from one route to another.
 * Increments the visit count for the (from, to) pair and persists.
 */
export function trackNavigation(from: string, to: string): void {
  loadPatterns();
  if (!patterns[from]) {
    patterns[from] = {};
  }
  patterns[from][to] = (patterns[from][to] ?? 0) + 1;
  persistPatterns();
}

/**
 * Return the top-N most likely next routes from `currentRoute`,
 * sorted by descending visit frequency.
 */
export function getPredictedNextRoutes(
  currentRoute: string,
  topN: number = 3,
): string[] {
  loadPatterns();
  const exits = patterns[currentRoute];
  if (!exits) return [];

  return Object.entries(exits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([route]) => route);
}

/**
 * Return the probability score (0–1) that a user on `from` will
 * navigate to `to`, based on historical visit counts.
 */
export function getRouteScore(from: string, to: string): number {
  loadPatterns();
  const exits = patterns[from];
  if (!exits) return 0;

  const total = Object.values(exits).reduce((sum, c) => sum + c, 0);
  if (total === 0) return 0;

  return (exits[to] ?? 0) / total;
}

/**
 * Clear all recorded patterns. Useful for testing or user-initiated reset.
 */
export function resetPatterns(): void {
  patterns = {};
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
}
