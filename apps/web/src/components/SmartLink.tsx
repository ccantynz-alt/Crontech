// ── Smart Link ──────────────────────────────────────────────────────
// Enhanced <A> component from SolidJS router that integrates with
// route analytics for predictive prefetching on hover, focus, and
// viewport intersection.

import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount, splitProps } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { isServer } from "solid-js/web";
import { getTransitionProbability } from "../lib/route-analytics";
import { forcePrefetch, prefetchIfLikely } from "../lib/prefetcher";
import { navigateWithTransition, isViewTransitionSupported } from "../lib/view-transitions";
import { useNavigate } from "@solidjs/router";

// ── Types ────────────────────────────────────────────────────────────

export interface SmartLinkProps {
  href: string;
  children: JSX.Element;
  class?: string;
  /** Additional CSS classes */
  classList?: Record<string, boolean>;
  /** If true, always prefetch on viewport intersection regardless of probability */
  prefetchOnView?: boolean;
  /** If true, disable smart prefetching (acts like a regular <A>) */
  disablePrefetch?: boolean;
  /** Optional view-transition-name for element transitions */
  viewTransitionName?: string;
  /** Minimum probability threshold for viewport-based prefetching. Default: 0.2 */
  viewportThreshold?: number;
  /** Standard anchor attributes */
  target?: string;
  rel?: string;
  title?: string;
  "aria-label"?: string;
  "aria-current"?: string;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * Enhanced navigation link that prefetches likely destinations based
 * on route analytics data.
 *
 * - On hover/focus: checks transition probability and prefetches if likely
 * - On viewport intersection: prefetches high-probability links
 * - Renders as a standard <a> tag with all accessibility attributes
 * - Integrates with View Transitions API when available
 */
export function SmartLink(props: SmartLinkProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "href",
    "children",
    "class",
    "classList",
    "prefetchOnView",
    "disablePrefetch",
    "viewTransitionName",
    "viewportThreshold",
  ]);

  const location = useLocation();
  const navigate = useNavigate();
  let anchorRef: HTMLAnchorElement | undefined;
  const [hasPrefetched, setHasPrefetched] = createSignal(false);

  // Hover/focus handler — prefetch the route
  const handleHoverOrFocus = (): void => {
    if (isServer || local.disablePrefetch || hasPrefetched()) return;

    const currentRoute = location.pathname;

    // Always prefetch on explicit hover — user is signaling intent
    forcePrefetch(local.href);
    setHasPrefetched(true);

    // Also trigger probability-aware prefetching
    prefetchIfLikely(currentRoute, local.href);
  };

  // Touch handler — immediate prefetch (user is committed)
  const handleTouchStart = (): void => {
    if (isServer || local.disablePrefetch || hasPrefetched()) return;
    forcePrefetch(local.href);
    setHasPrefetched(true);
  };

  // Click handler — integrate with View Transitions API
  const handleClick = (e: MouseEvent): void => {
    // Let browser handle modified clicks (new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Let browser handle external links
    if (rest.target === "_blank") return;

    // Only intercept for View Transitions
    if (!isViewTransitionSupported()) return;
    if (!local.viewTransitionName && !isViewTransitionSupported()) return;

    e.preventDefault();
    navigateWithTransition(() => {
      navigate(local.href);
    });
  };

  // Viewport intersection — prefetch when the link scrolls into view
  onMount(() => {
    if (isServer || local.disablePrefetch || !anchorRef) return;
    if (typeof IntersectionObserver === "undefined") return;

    const threshold = local.viewportThreshold ?? 0.2;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const observerEntry of observerEntries) {
          if (!observerEntry.isIntersecting) continue;
          if (hasPrefetched()) continue;

          const currentRoute = location.pathname;
          const probability = getTransitionProbability(currentRoute, local.href);

          if (local.prefetchOnView || probability >= threshold) {
            forcePrefetch(local.href);
            setHasPrefetched(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(anchorRef);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  return (
    <A
      ref={anchorRef}
      href={local.href}
      class={local.class}
      classList={local.classList}
      onMouseEnter={handleHoverOrFocus}
      onFocus={handleHoverOrFocus}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      style={
        local.viewTransitionName
          ? { "view-transition-name": local.viewTransitionName }
          : undefined
      }
      {...rest}
    >
      {local.children}
    </A>
  );
}
