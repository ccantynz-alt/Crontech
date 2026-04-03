// ── SmartLink ────────────────────────────────────────────────────────
// Enhanced link component that integrates with the AI-driven navigation
// system. Prefetches target routes on hover and when the link enters
// the viewport. Shows a subtle loading indicator during prefetch.
// Uses SolidJS primitives throughout -- no React hooks.

import {
  type JSX,
  Show,
  createSignal,
  mergeProps,
  onCleanup,
  onMount,
  splitProps,
} from "solid-js";
import { A } from "@solidjs/router";
import { useNavigation } from "../lib/navigation";
import { prefetchRoute } from "../lib/route-prefetcher";
import { getPredictedData, prefetchData } from "../lib/data-prefetcher";

// ── Types ───────────────────────────────────────────────────────────

export interface SmartLinkProps {
  /** Target route path (required). */
  href: string;
  /** Link content. */
  children: JSX.Element;
  /** Additional CSS class(es). */
  class?: string;
  /** Whether to prefetch on viewport intersection (default: true). */
  prefetchOnView?: boolean;
  /** Whether to prefetch on hover/focus (default: true). */
  prefetchOnHover?: boolean;
  /** Whether to show loading indicator during prefetch (default: true). */
  showLoadingIndicator?: boolean;
  /** IntersectionObserver rootMargin for viewport prefetch (default: "200px"). */
  viewportMargin?: string;
  /** Accessible label for the link. */
  "aria-label"?: string;
}

// ── Component ───────────────────────────────────────────────────────

export function SmartLink(inProps: SmartLinkProps): JSX.Element {
  const defaults = {
    prefetchOnView: true,
    prefetchOnHover: true,
    showLoadingIndicator: true,
    viewportMargin: "200px",
  };

  const merged = mergeProps(defaults, inProps);
  const [local, linkProps] = splitProps(merged, [
    "href",
    "children",
    "class",
    "prefetchOnView",
    "prefetchOnHover",
    "showLoadingIndicator",
    "viewportMargin",
    "aria-label",
  ]);

  const [hasPrefetched, setHasPrefetched] = createSignal(false);
  const [isPrefetching, setIsPrefetching] = createSignal(false);

  let linkRef: HTMLAnchorElement | undefined;

  // Access navigation context (safe -- throws if provider missing).
  let navigation: ReturnType<typeof useNavigation> | undefined;
  try {
    navigation = useNavigation();
  } catch {
    // If NavigationProvider is not mounted, SmartLink still works as
    // a regular link -- just without predictive prefetching.
  }

  // ── Prefetch Logic ──────────────────────────────────────────────

  const triggerPrefetch = (): void => {
    if (hasPrefetched()) return;
    setHasPrefetched(true);
    setIsPrefetching(true);

    // Prefetch the route HTML/JS.
    prefetchRoute(local.href);

    // Prefetch predicted data for the target route.
    const procedures = getPredictedData(local.href);
    if (procedures.length > 0) {
      prefetchData(procedures);
    }

    // Also notify the navigation manager if available.
    if (navigation !== undefined) {
      navigation.prefetch(local.href);
      navigation.prefetchRouteData(local.href);
    }

    // Clear the prefetching indicator after a short delay.
    const timer = setTimeout(() => {
      setIsPrefetching(false);
    }, 300);
    onCleanup(() => clearTimeout(timer));
  };

  // ── Viewport Intersection Observer ────────────────────────────

  onMount((): void => {
    if (!local.prefetchOnView) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (linkRef === undefined) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            triggerPrefetch();
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: local.viewportMargin },
    );

    observer.observe(linkRef);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  // ── Event Handlers ────────────────────────────────────────────

  const handleMouseEnter: JSX.EventHandler<HTMLAnchorElement, MouseEvent> = () => {
    if (local.prefetchOnHover) {
      triggerPrefetch();
    }
  };

  const handleFocus: JSX.EventHandler<HTMLAnchorElement, FocusEvent> = () => {
    if (local.prefetchOnHover) {
      triggerPrefetch();
    }
  };

  // ── Render ────────────────────────────────────────────────────

  // Compute the navigation score for this link target (0-1).
  const routeScore = (): number => {
    if (navigation === undefined) return 0;
    return navigation.getScore(local.href);
  };

  return (
    <A
      ref={linkRef}
      href={local.href}
      class={`smart-link ${local.class ?? ""}`}
      aria-label={local["aria-label"]}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      data-prefetched={hasPrefetched() ? "" : undefined}
      data-route-score={routeScore() > 0 ? routeScore().toFixed(2) : undefined}
      {...linkProps}
    >
      {local.children}
      <Show when={local.showLoadingIndicator && isPrefetching()}>
        <span
          class="smart-link-indicator"
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            "margin-left": "4px",
            "border-radius": "50%",
            "background-color": "currentColor",
            opacity: "0.4",
            animation: "smart-link-pulse 0.6s ease-in-out infinite alternate",
          }}
        />
      </Show>
    </A>
  );
}
