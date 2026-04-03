// ── Predictive Prefetcher ───────────────────────────────────────────
// Prefetches likely next pages based on route analytics transition
// probabilities. Uses requestIdleCallback to avoid blocking the main
// thread. Respects navigator.connection.saveData and metered connections.

import { getTopNextRoutes, getTransitionProbability } from "./route-analytics";
import type { RouteScore } from "./route-analytics";
import { prefetchRoute, prefetchData } from "./prefetch";

/** True when running in a non-browser environment. */
const isServer: boolean =
  typeof globalThis.document === "undefined" ||
  typeof globalThis.window === "undefined";

// ── Types ────────────────────────────────────────────────────────────

export interface PrefetchConfig {
  /** Minimum transition probability to trigger prefetch (0-1). Default: 0.3 */
  threshold: number;
  /** Maximum number of routes to prefetch simultaneously. Default: 3 */
  maxPrefetches: number;
  /** Whether to prefetch route JS chunks. Default: true */
  prefetchRoutes: boolean;
  /** Whether to prefetch data via tRPC. Default: true */
  prefetchDataEnabled: boolean;
  /** Whether to prefetch assets (images/fonts). Default: true */
  prefetchAssets: boolean;
}

export interface PrefetchState {
  /** Currently prefetching for this route */
  currentRoute: string | null;
  /** Routes that have been prefetched in this session */
  prefetchedRoutes: Set<string>;
  /** Active idle callback ID (for cancellation) */
  activeCallbackId: number | null;
}

// ── Route-to-data mapping ────────────────────────────────────────────
// Maps route patterns to tRPC data endpoints for data prefetching.

type DataPrefetchMapping = Record<string, string[]>;

let dataMappings: DataPrefetchMapping = {};

// ── Route-to-asset mapping ───────────────────────────────────────────
// Maps route patterns to asset URLs for asset prefetching.

type AssetPrefetchMapping = Record<string, string[]>;

let assetMappings: AssetPrefetchMapping = {};

// ── Config ───────────────────────────────────────────────────────────

const config: PrefetchConfig = {
  threshold: 0.3,
  maxPrefetches: 3,
  prefetchRoutes: true,
  prefetchDataEnabled: true,
  prefetchAssets: true,
};

// ── State ────────────────────────────────────────────────────────────

const state: PrefetchState = {
  currentRoute: null,
  prefetchedRoutes: new Set(),
  activeCallbackId: null,
};

// ── Idle Callback Abstraction ────────────────────────────────────────

const scheduleIdle: (cb: IdleRequestCallback) => number =
  !isServer && typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb: IdleRequestCallback) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline), 1) as unknown as number;

const cancelIdle: (id: number) => void =
  !isServer && typeof cancelIdleCallback === "function"
    ? cancelIdleCallback
    : (id: number) => clearTimeout(id);

// ── Connection Check ─────────────────────────────────────────────────

/** Returns true if the connection allows prefetching. */
function canPrefetch(): boolean {
  if (isServer) return false;
  if (typeof navigator === "undefined") return false;

  if ("connection" in navigator) {
    const conn = navigator.connection as {
      saveData?: boolean;
      effectiveType?: string;
    };
    if (conn.saveData) return false;
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") {
      return false;
    }
  }

  return true;
}

// ── Asset Prefetching ────────────────────────────────────────────────

function prefetchAsset(url: string): void {
  if (state.prefetchedRoutes.has(`asset:${url}`)) return;
  state.prefetchedRoutes.add(`asset:${url}`);

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url;

  // Infer the `as` attribute from file extension
  if (url.match(/\.(woff2?|ttf|otf|eot)(\?|$)/)) {
    link.as = "font";
    link.crossOrigin = "anonymous";
  } else if (url.match(/\.(png|jpg|jpeg|gif|webp|avif|svg)(\?|$)/)) {
    link.as = "image";
  } else if (url.match(/\.(css)(\?|$)/)) {
    link.as = "style";
  } else if (url.match(/\.(js|mjs)(\?|$)/)) {
    link.as = "script";
  }

  document.head.appendChild(link);
}

// ── Core Prefetch Logic ──────────────────────────────────────────────

function executePrefetch(scores: RouteScore[]): void {
  if (!canPrefetch()) return;

  for (const score of scores) {
    if (state.prefetchedRoutes.has(score.route)) continue;
    state.prefetchedRoutes.add(score.route);

    // Route chunk prefetch
    if (config.prefetchRoutes) {
      prefetchRoute(score.route);
    }

    // Data prefetch
    if (config.prefetchDataEnabled) {
      const dataUrls = dataMappings[score.route];
      if (dataUrls) {
        for (const url of dataUrls) {
          prefetchData(url);
        }
      }
    }

    // Asset prefetch
    if (config.prefetchAssets) {
      const assetUrls = assetMappings[score.route];
      if (assetUrls) {
        for (const url of assetUrls) {
          prefetchAsset(url);
        }
      }
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Start predictive prefetching based on the current route.
 * Queries route analytics for likely next routes and prefetches
 * during idle time if probability exceeds the threshold.
 */
export function startPrefetching(currentRoute: string): void {
  if (isServer) return;

  // Cancel any existing prefetch operation
  stopPrefetching();

  state.currentRoute = currentRoute;

  const scores = getTopNextRoutes(currentRoute, config.maxPrefetches);
  const eligible = scores.filter((s) => s.probability >= config.threshold);

  if (eligible.length === 0) return;

  state.activeCallbackId = scheduleIdle((deadline: IdleDeadline) => {
    // Only prefetch if we have idle time
    if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
      executePrefetch(eligible);
    }
    state.activeCallbackId = null;
  });
}

/**
 * Stop any in-progress prefetching.
 */
export function stopPrefetching(): void {
  if (state.activeCallbackId !== null) {
    cancelIdle(state.activeCallbackId);
    state.activeCallbackId = null;
  }
  state.currentRoute = null;
}

/**
 * Set the minimum transition probability threshold for prefetching.
 * Routes with probability below this value will not be prefetched.
 */
export function setPrefetchThreshold(threshold: number): void {
  config.threshold = Math.max(0, Math.min(1, threshold));
}

/**
 * Get the current prefetch threshold.
 */
export function getPrefetchThreshold(): number {
  return config.threshold;
}

/**
 * Configure the maximum number of routes to prefetch simultaneously.
 */
export function setMaxPrefetches(max: number): void {
  config.maxPrefetches = Math.max(1, Math.floor(max));
}

/**
 * Toggle route chunk prefetching.
 */
export function setRoutePrefetchEnabled(enabled: boolean): void {
  config.prefetchRoutes = enabled;
}

/**
 * Toggle data prefetching.
 */
export function setDataPrefetchEnabled(enabled: boolean): void {
  config.prefetchDataEnabled = enabled;
}

/**
 * Toggle asset prefetching.
 */
export function setAssetPrefetchEnabled(enabled: boolean): void {
  config.prefetchAssets = enabled;
}

/**
 * Register data URLs to prefetch for a given route.
 * When the prefetcher predicts a user will navigate to this route,
 * it will also prefetch these data endpoints.
 */
export function registerDataPrefetch(route: string, urls: string[]): void {
  dataMappings[route] = urls;
}

/**
 * Register asset URLs to prefetch for a given route.
 */
export function registerAssetPrefetch(route: string, urls: string[]): void {
  assetMappings[route] = urls;
}

/**
 * Clear all data and asset mappings.
 */
export function clearMappings(): void {
  dataMappings = {};
  assetMappings = {};
}

/**
 * Prefetch a specific route if its transition probability from the
 * current route exceeds the threshold. Used by SmartLink on hover/focus.
 */
export function prefetchIfLikely(fromRoute: string, toRoute: string): void {
  if (isServer || !canPrefetch()) return;
  if (state.prefetchedRoutes.has(toRoute)) return;

  const probability = getTransitionProbability(fromRoute, toRoute);
  if (probability >= config.threshold) {
    state.prefetchedRoutes.add(toRoute);
    prefetchRoute(toRoute);
  }
}

/**
 * Force prefetch a route regardless of probability.
 * Used when the user explicitly signals intent (e.g., hover on a link).
 */
export function forcePrefetch(route: string): void {
  if (isServer || !canPrefetch()) return;
  if (state.prefetchedRoutes.has(route)) return;

  state.prefetchedRoutes.add(route);
  prefetchRoute(route);
}

/**
 * Reset the prefetcher state (clear prefetched set).
 * Useful for testing or when the user context changes significantly.
 */
export function resetPrefetcherState(): void {
  stopPrefetching();
  state.prefetchedRoutes.clear();
  state.currentRoute = null;
}

/**
 * Get the current prefetcher state (for debugging).
 */
export function getPrefetcherState(): Readonly<{
  currentRoute: string | null;
  prefetchedCount: number;
  isActive: boolean;
}> {
  return {
    currentRoute: state.currentRoute,
    prefetchedCount: state.prefetchedRoutes.size,
    isActive: state.activeCallbackId !== null,
  };
}
