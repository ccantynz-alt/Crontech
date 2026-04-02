// @refresh reload
import { StartClient, mount } from "@solidjs/start/client";
import { registerServiceWorker } from "./lib/sw-register";
import { reportWebVitals } from "./lib/performance";

mount(() => <StartClient />, document.getElementById("app")!);

// Track hydration timing
const hydrationEnd = performance.now();
const navigationStart =
  performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
if (navigationStart) {
  const hydrationTime = hydrationEnd - navigationStart.responseEnd;
  console.log(`[perf] Hydration completed in ${hydrationTime.toFixed(1)}ms`);
}

// Initialize Core Web Vitals reporting
reportWebVitals((metric) => {
  console.log(`[perf] ${metric.name}: ${metric.value.toFixed(1)}${metric.unit}`);

  if (import.meta.env.PROD && navigator.sendBeacon) {
    navigator.sendBeacon("/api/vitals", JSON.stringify(metric));
  }
});

// Defer non-critical work to idle time
const scheduleIdle =
  typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1);

scheduleIdle(() => {
  // Skip prefetching on slow connections
  if ("connection" in navigator) {
    const conn = navigator.connection as { saveData?: boolean; effectiveType?: string };
    if (conn.saveData || conn.effectiveType === "slow-2g") return;
  }

  // Register service worker for offline-first PWA
  registerServiceWorker({
    onUpdate: () => {
      console.info("[SW] New version available. Refresh to update.");
    },
    onInstall: () => {
      console.info("[SW] App is now available offline.");
    },
  });
});
