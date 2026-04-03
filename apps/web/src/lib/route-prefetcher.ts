// ── AI-Driven Route Prefetcher ───────────────────────────────────────
// Listens for route changes, queries the route optimizer for predicted
// next routes, and injects <link rel="prefetch"> tags so browsers can
// speculatively load resources. Fully SSR-safe.

import { getPredictedNextRoutes, trackNavigation } from "./route-optimizer";

/** Set of hrefs that already have a prefetch link in the document. */
const prefetched = new Set<string>();

/** The last known route, used to track navigation pairs. */
let previousRoute: string | null = null;

/**
 * Inject a `<link rel="prefetch">` for the given route if one does
 * not already exist. No-op on the server.
 */
export function prefetchRoute(route: string): void {
  if (typeof document === "undefined") return;
  if (prefetched.has(route)) return;

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = route;
  document.head.appendChild(link);
  prefetched.add(route);
}

/**
 * Begin observing route changes. On every navigation:
 *  1. Records the transition in the route optimizer.
 *  2. Prefetches the top predicted next routes.
 *
 * Uses the History API (pushState / popstate) so it works with any
 * SPA router, including SolidStart's file-based router.
 *
 * Call once at application startup (e.g. inside an `onMount`).
 */
export function setupPrefetching(): void {
  if (typeof window === "undefined") return;

  const handleRouteChange = (url: string): void => {
    const route = new URL(url, window.location.origin).pathname;

    if (previousRoute !== null && previousRoute !== route) {
      trackNavigation(previousRoute, route);
    }
    previousRoute = route;

    // Prefetch the most likely next destinations.
    const predicted = getPredictedNextRoutes(route, 3);
    for (const next of predicted) {
      prefetchRoute(next);
    }
  };

  // Capture the initial page.
  handleRouteChange(window.location.href);

  // Intercept programmatic navigation (pushState / replaceState).
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function pushStateWrapper(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    originalPushState(data, unused, url);
    if (url) handleRouteChange(String(url));
  };

  history.replaceState = function replaceStateWrapper(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    originalReplaceState(data, unused, url);
    if (url) handleRouteChange(String(url));
  };

  // Capture browser back/forward.
  window.addEventListener("popstate", () => {
    handleRouteChange(window.location.href);
  });
}
