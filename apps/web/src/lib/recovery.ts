// ── Recovery Strategies ──────────────────────────────────────────────
//
// Self-healing recovery functions used by the SmartErrorBoundary and
// the global error handler. Each strategy targets a specific error
// category and attempts to resolve the issue without user intervention.

// ── Retry With Exponential Backoff ───────────────────────────────────

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, delay: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
};

/**
 * Retry a function with exponential backoff.
 *
 * Delay formula: min(baseDelay * 2^attempt, maxDelay) + optional jitter.
 * Jitter adds 0-50% random time to prevent thundering herd.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const maxDelay = opts.maxDelay ?? 30000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt >= opts.maxRetries) break;

      let delay = Math.min(opts.baseDelay * 2 ** attempt, maxDelay);

      if (opts.jitter) {
        delay += Math.floor(Math.random() * delay * 0.5);
      }

      opts.onRetry?.(attempt + 1, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

// ── Clear Cache and Refetch ──────────────────────────────────────────

/**
 * Clear cached data for a given key and trigger a refetch.
 *
 * Works with any cache that stores data in sessionStorage / localStorage
 * under a key prefix. Returns true if cache was cleared.
 */
export function clearAndRefetch(queryKey: string): boolean {
  if (typeof window === "undefined") return false;

  let cleared = false;

  // Clear sessionStorage entries matching the key
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key !== null && key.includes(queryKey)) {
        sessionStorage.removeItem(key);
        cleared = true;
      }
    }
  } catch {
    // sessionStorage may be unavailable in some contexts
  }

  // Clear localStorage entries matching the key
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key !== null && key.includes(queryKey)) {
        localStorage.removeItem(key);
        cleared = true;
      }
    }
  } catch {
    // localStorage may be unavailable in some contexts
  }

  return cleared;
}

// ── Soft Reload ──────────────────────────────────────────────────────

/**
 * Clear transient application state and re-mount the SolidJS component
 * tree without a full page reload.
 *
 * Strategy:
 * 1. Clear sessionStorage (transient state)
 * 2. Replace the current URL to trigger route re-evaluation
 *
 * Falls back to a full page reload if the soft approach fails.
 */
export function softReload(): void {
  if (typeof window === "undefined") return;

  try {
    // Clear session-level caches
    sessionStorage.clear();

    // Re-navigate to the current URL to re-mount route components
    // Using replaceState + popstate triggers SolidJS router re-evaluation
    const currentUrl = window.location.href;
    window.history.replaceState(null, "", currentUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    // If soft reload fails, fall back to hard reload
    window.location.reload();
  }
}

// ── Redirect to Auth ─────────────────────────────────────────────────

/**
 * Redirect to the login page when the session has expired.
 *
 * Stores the current URL so the user can be redirected back after login.
 */
export function redirectToAuth(loginPath?: string): void {
  if (typeof window === "undefined") return;

  const path = loginPath ?? "/login";
  const returnTo = window.location.pathname + window.location.search;

  // Store return URL for post-login redirect
  try {
    sessionStorage.setItem("cronix_return_to", returnTo);
  } catch {
    // Best-effort storage
  }

  // Use replaceState to avoid polluting history with the broken page
  window.location.replace(path);
}

// ── Error Frequency Tracker ──────────────────────────────────────────

interface ErrorOccurrence {
  timestamp: number;
  key: string;
}

const errorHistory: ErrorOccurrence[] = [];
const MAX_HISTORY = 100;

/**
 * Generate a stable key for an error to track duplicates.
 */
export function errorKey(message: string, component?: string): string {
  return `${component ?? "global"}::${message}`;
}

/**
 * Record an error occurrence and return true if the error has exceeded
 * the frequency threshold (default: 3 times in 60 seconds).
 */
export function isErrorTooFrequent(
  key: string,
  maxOccurrences?: number,
  windowMs?: number,
): boolean {
  const now = Date.now();
  const max = maxOccurrences ?? 3;
  const window = windowMs ?? 60_000;

  // Record this occurrence
  errorHistory.push({ timestamp: now, key });

  // Prune old entries
  const cutoff = now - window;
  while (errorHistory.length > 0 && (errorHistory[0]?.timestamp ?? 0) < cutoff) {
    errorHistory.shift();
  }

  // Cap total history size
  while (errorHistory.length > MAX_HISTORY) {
    errorHistory.shift();
  }

  // Count occurrences in window
  const count = errorHistory.filter(
    (e) => e.key === key && e.timestamp >= cutoff,
  ).length;

  return count >= max;
}

/**
 * Reset the error frequency tracker. Useful for testing.
 */
export function resetErrorHistory(): void {
  errorHistory.length = 0;
}

// ── Internal Helpers ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
