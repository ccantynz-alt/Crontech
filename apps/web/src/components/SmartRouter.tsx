// ── Smart Router ────────────────────────────────────────────────────
// SolidJS component that wraps @solidjs/router to automatically:
// - Record navigations to route analytics
// - Trigger predictive prefetching on each navigation
// - Integrate with the View Transitions API when available

import type { JSX } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useLocation } from "@solidjs/router";
import { isServer } from "solid-js/web";
import { recordNavigation } from "../lib/route-analytics";
import { startPrefetching, stopPrefetching } from "../lib/prefetcher";

// ── Types ────────────────────────────────────────────────────────────

export interface SmartRouterProps {
  children: JSX.Element;
  /** Disable analytics recording. Default: false */
  disableAnalytics?: boolean;
  /** Disable predictive prefetching. Default: false */
  disablePrefetching?: boolean;
  /** Disable View Transitions API integration. Default: false */
  disableViewTransitions?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Wraps the content rendered inside @solidjs/router to track navigation
 * patterns and trigger predictive prefetching. Place this component
 * inside the Router's root prop render function.
 *
 * ```tsx
 * <Router root={(props) => (
 *   <SmartRouter>{props.children}</SmartRouter>
 * )}>
 *   <FileRoutes />
 * </Router>
 * ```
 */
export function SmartRouter(props: SmartRouterProps): JSX.Element {
  if (isServer) {
    return props.children as JSX.Element;
  }

  const location = useLocation();
  const [previousPath, setPreviousPath] = createSignal<string | null>(null);

  // Track navigations and trigger prefetching
  createEffect(() => {
    const currentPath = location.pathname;
    const prevPath = previousPath();

    if (prevPath !== null && prevPath !== currentPath) {
      // Record the navigation transition
      if (!props.disableAnalytics) {
        recordNavigation(prevPath, currentPath);
      }

      // Trigger predictive prefetching for the new route
      if (!props.disablePrefetching) {
        startPrefetching(currentPath);
      }
    } else if (prevPath === null && !props.disablePrefetching) {
      // First load — start prefetching from initial route
      startPrefetching(currentPath);
    }

    setPreviousPath(currentPath);
  });

  // Apply View Transitions API meta tag if supported
  createEffect(() => {
    if (props.disableViewTransitions) return;
    if (typeof document === "undefined") return;

    // Check if View Transitions API is supported
    if (!("startViewTransition" in document)) return;

    // Add the meta tag for cross-document view transitions
    const existing = document.querySelector('meta[name="view-transition"]');
    if (!existing) {
      const meta = document.createElement("meta");
      meta.name = "view-transition";
      meta.content = "same-origin";
      document.head.appendChild(meta);

      onCleanup(() => {
        meta.remove();
      });
    }
  });

  // Cleanup prefetching on unmount
  onCleanup(() => {
    stopPrefetching();
  });

  return props.children as JSX.Element;
}
