// ── Privacy-Respecting Analytics ─────────────────────────────────────
// Simple, in-house analytics. No third-party scripts. Batch sends to
// our own API. Respects cookie consent settings.

import { trpc } from "./trpc";

const CONSENT_KEY = "btf_cookie_consent";
const SESSION_ID_KEY = "btf_analytics_session";
const FLUSH_INTERVAL_MS = 30_000;

// ── Types ────────────────────────────────────────────────────────────

interface AnalyticsEvent {
  event: string;
  category: "page_view" | "feature_usage" | "ai_generation" | "time_on_page";
  properties?: Record<string, unknown>;
  timestamp: string;
  sessionId?: string;
}

// ── State ────────────────────────────────────────────────────────────

let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let pageLoadTime: number | null = null;

// ── Helpers ──────────────────────────────────────────────────────────

function getConsent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function isTrackingAllowed(): boolean {
  const consent = getConsent();
  // Only track if user has accepted "all" cookies
  // "essential" means no tracking
  return consent === "all";
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return "unknown";
  }
}

// ── Core ─────────────────────────────────────────────────────────────

function enqueue(event: AnalyticsEvent): void {
  if (!isTrackingAllowed()) return;
  eventQueue.push(event);
}

async function flush(): Promise<void> {
  if (eventQueue.length === 0) return;
  if (!isTrackingAllowed()) {
    eventQueue = [];
    return;
  }

  const batch = eventQueue.splice(0, eventQueue.length);

  try {
    await trpc.analytics.track.mutate({ events: batch });
  } catch (_err) {
    // On failure, put events back for retry (capped to avoid memory leak)
    if (eventQueue.length < 500) {
      eventQueue.unshift(...batch);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (initialized) return;
  initialized = true;

  pageLoadTime = Date.now();

  // Start the batch flush timer
  flushTimer = setInterval(() => {
    flush();
  }, FLUSH_INTERVAL_MS);

  // Flush on page unload
  window.addEventListener("beforeunload", () => {
    // Track time on page before leaving
    if (pageLoadTime !== null) {
      const duration = Math.round((Date.now() - pageLoadTime) / 1000);
      enqueue({
        event: "page_session_end",
        category: "time_on_page",
        properties: { durationSeconds: duration, path: window.location.pathname },
        timestamp: new Date().toISOString(),
        sessionId: getSessionId(),
      });
    }
    // Synchronous flush attempt via sendBeacon-compatible approach
    flush();
  });
}

export function stopAnalytics(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush();
  initialized = false;
}

export function trackPageView(path: string): void {
  pageLoadTime = Date.now();
  enqueue({
    event: "page_view",
    category: "page_view",
    properties: { path },
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  });
}

export function trackFeatureUsage(feature: string, metadata?: Record<string, unknown>): void {
  enqueue({
    event: `feature:${feature}`,
    category: "feature_usage",
    properties: { feature, ...metadata },
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  });
}

export function trackAIGeneration(model: string, metadata?: Record<string, unknown>): void {
  enqueue({
    event: "ai_generation",
    category: "ai_generation",
    properties: { model, ...metadata },
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  });
}

export function trackTimeOnPage(path: string, durationSeconds: number): void {
  enqueue({
    event: "time_on_page",
    category: "time_on_page",
    properties: { path, durationSeconds },
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  });
}
