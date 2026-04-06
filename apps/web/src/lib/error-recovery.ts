/**
 * Client-side error recovery helpers.
 * Goal: users never see stack traces, never get blocked.
 */

const DEFAULT_BACKOFF = [500, 1000, 2000, 4000];

export interface RetryOptions {
  retries?: number;
  backoffMs?: number[];
  onRetry?: (attempt: number, err: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      opts.onRetry?.(attempt + 1, err);
      const delay = backoff[Math.min(attempt, backoff.length - 1)] ?? 4000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Friendly user messages mapped from common error patterns.
 * Never returns a stack trace.
 */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("network") || lower.includes("fetch")) {
    return "We're having trouble reaching the server. Reconnecting...";
  }
  if (lower.includes("timeout")) {
    return "That took longer than expected. Please try again.";
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "Your session expired. Please sign in again.";
  }
  if (lower.includes("rate")) {
    return "You're going a little fast! Please wait a moment.";
  }
  if (lower.includes("stripe") || lower.includes("payment")) {
    return "Upgrades are temporarily unavailable. You can keep using free features.";
  }
  if (lower.includes("ai") || lower.includes("model")) {
    return "AI is briefly unavailable. We'll switch to demo mode.";
  }
  return "Something went wrong. We're on it - please try again.";
}

/**
 * Auto-reconnecting WebSocket wrapper.
 */
export interface ReconnectingWS {
  send: (data: string) => void;
  close: () => void;
}

export function createReconnectingWebSocket(
  url: string,
  handlers: { onMessage?: (data: string) => void; onOpen?: () => void; onClose?: () => void } = {},
): ReconnectingWS {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;

  function connect(): void {
    if (closed) return;
    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        handlers.onOpen?.();
      };
      ws.onmessage = (e) => handlers.onMessage?.(typeof e.data === "string" ? e.data : "");
      ws.onclose = () => {
        handlers.onClose?.();
        if (closed) return;
        const delay = Math.min(30000, 500 * 2 ** attempt);
        attempt += 1;
        setTimeout(connect, delay);
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    } catch {
      const delay = Math.min(30000, 500 * 2 ** attempt);
      attempt += 1;
      setTimeout(connect, delay);
    }
  }

  connect();

  return {
    send: (data) => {
      try {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      } catch {
        /* swallow */
      }
    },
    close: () => {
      closed = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * AI fallback to demo mode when the live AI provider fails.
 */
export const DEMO_AI_RESPONSES = [
  "(demo) Here's a sample response while AI is reconnecting.",
  "(demo) AI is briefly offline - showing a placeholder.",
  "(demo) Try again in a moment for a live response.",
];

export async function callAIWithFallback<T>(
  fn: () => Promise<T>,
  demoValue: T,
): Promise<{ value: T; demo: boolean }> {
  try {
    const value = await withRetry(fn, { retries: 2 });
    return { value, demo: false };
  } catch {
    return { value: demoValue, demo: true };
  }
}
