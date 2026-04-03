// ── Navigation Manager ───────────────────────────────────────────────
// Integrates the route optimizer and prefetcher with SolidStart's
// router. Provides a SolidJS context and `useNavigation()` hook so
// any component can access navigation intelligence. Fully SSR-safe.

import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import { useLocation } from "@solidjs/router";
import { getPredictedNextRoutes, getRouteScore } from "../route-optimizer";
import { prefetchRoute } from "../route-prefetcher";
import { getPredictedData, prefetchData } from "../data-prefetcher";
import {
  flushActiveVisit,
  getAllRouteMetrics,
  recordPageVisit,
} from "./analytics";

// ── Types ───────────────────────────────────────────────────────────

/** A predicted next route with its probability score. */
export interface PredictedRoute {
  route: string;
  score: number;
}

/** State exposed by the navigation context. */
export interface NavigationState {
  /** The current route pathname. */
  currentRoute: Accessor<string>;
  /** The previous route pathname, or undefined if this is the first page. */
  previousRoute: Accessor<string | undefined>;
  /** Top predicted next routes with scores, updated on each navigation. */
  predictedRoutes: Accessor<readonly PredictedRoute[]>;
  /** Whether prefetching is currently in progress. */
  isPrefetching: Accessor<boolean>;
  /** Manually trigger prefetch for a specific route. */
  prefetch: (route: string) => void;
  /** Manually trigger prefetch for a route's data (tRPC procedures). */
  prefetchRouteData: (route: string) => void;
  /** Get the probability score for navigating from current route to target. */
  getScore: (target: string) => number;
  /** Get aggregated analytics for all routes. */
  getMetrics: typeof getAllRouteMetrics;
}

// ── Context ─────────────────────────────────────────────────────────

const NavigationContext = createContext<NavigationState>();

// ── Provider ────────────────────────────────────────────────────────

/** Maximum number of predicted routes to track and prefetch. */
const MAX_PREDICTIONS = 5;

/** Minimum score threshold for auto-prefetching a predicted route. */
const AUTO_PREFETCH_THRESHOLD = 0.1;

export function NavigationProvider(props: {
  children: JSX.Element;
}): JSX.Element {
  const location = useLocation();

  const [currentRoute, setCurrentRoute] = createSignal<string>(
    location.pathname,
  );
  const [previousRoute, setPreviousRoute] = createSignal<string | undefined>(
    undefined,
  );
  const [isPrefetching, setIsPrefetching] = createSignal<boolean>(false);

  // Derived: predicted next routes with scores.
  const predictedRoutes = createMemo((): readonly PredictedRoute[] => {
    const route = currentRoute();
    const predicted = getPredictedNextRoutes(route, MAX_PREDICTIONS);
    return predicted.map((r) => ({
      route: r,
      score: getRouteScore(route, r),
    }));
  });

  // Track route changes from SolidStart's router.
  createEffect((): void => {
    const newRoute = location.pathname;
    const oldRoute = currentRoute();

    if (newRoute === oldRoute) return;

    setPreviousRoute(oldRoute);
    setCurrentRoute(newRoute);

    // Record the visit for analytics (feeds route optimizer).
    recordPageVisit(newRoute);

    // Auto-prefetch predicted next routes that exceed the threshold.
    setIsPrefetching(true);
    const predictions = getPredictedNextRoutes(newRoute, MAX_PREDICTIONS);
    let prefetchCount = 0;

    for (const predicted of predictions) {
      const score = getRouteScore(newRoute, predicted);
      if (score >= AUTO_PREFETCH_THRESHOLD) {
        prefetchRoute(predicted);

        // Also prefetch data for highly-likely routes.
        const procedures = getPredictedData(predicted);
        if (procedures.length > 0) {
          prefetchData(procedures);
        }
        prefetchCount += 1;
      }
    }

    // Small delay to let prefetch links settle before clearing indicator.
    if (prefetchCount > 0) {
      const timer = setTimeout(() => {
        setIsPrefetching(false);
      }, 300);
      onCleanup(() => clearTimeout(timer));
    } else {
      setIsPrefetching(false);
    }
  });

  // Record the initial page visit on mount.
  onMount((): void => {
    recordPageVisit(location.pathname);
  });

  // Flush analytics on page unload to capture final time-on-page.
  onMount((): void => {
    if (typeof window === "undefined") return;

    const handleUnload = (): void => {
      flushActiveVisit();
    };

    window.addEventListener("beforeunload", handleUnload);
    onCleanup(() => {
      window.removeEventListener("beforeunload", handleUnload);
    });
  });

  const manualPrefetch = (route: string): void => {
    prefetchRoute(route);
  };

  const manualPrefetchData = (route: string): void => {
    const procedures = getPredictedData(route);
    if (procedures.length > 0) {
      prefetchData(procedures);
    }
  };

  const getScoreForTarget = (target: string): number => {
    return getRouteScore(currentRoute(), target);
  };

  const state: NavigationState = {
    currentRoute,
    previousRoute,
    predictedRoutes,
    isPrefetching,
    prefetch: manualPrefetch,
    prefetchRouteData: manualPrefetchData,
    getScore: getScoreForTarget,
    getMetrics: getAllRouteMetrics,
  };

  return (
    <NavigationContext.Provider value={state}>
      {props.children}
    </NavigationContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Access the navigation intelligence state from any component within
 * a `NavigationProvider`.
 *
 * @throws if used outside a `NavigationProvider`.
 */
export function useNavigation(): NavigationState {
  const ctx = useContext(NavigationContext);
  if (ctx === undefined) {
    throw new Error(
      "useNavigation must be used within a <NavigationProvider>",
    );
  }
  return ctx;
}

// ── Re-exports ──────────────────────────────────────────────────────

export {
  recordPageVisit,
  recordDataAccess,
  flushActiveVisit,
  getRouteMetrics,
  getAllRouteMetrics,
  resetAnalytics,
} from "./analytics";

export type { PredictedRoute as PredictedRouteInfo };
