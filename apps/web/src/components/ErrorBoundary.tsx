// ── Smart Error Boundary ─────────────────────────────────────────────
//
// A SolidJS error boundary that diagnoses errors, attempts automatic
// recovery, and renders contextual fallback UI.

import {
  type Component,
  type JSX,
  ErrorBoundary,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  classifyError,
  type ClassifiedError,
} from "../lib/error-classifier";
import {
  clearAndRefetch,
  redirectToAuth,
  errorKey,
  isErrorTooFrequent,
} from "../lib/recovery";

// ── Props ────────────────────────────────────────────────────────────

export interface SmartErrorBoundaryProps {
  /** Custom fallback renderer. Receives the classified error and a retry callback. */
  fallback?: (err: ClassifiedError, retry: () => void) => JSX.Element;
  /** Telemetry / logging callback fired on every captured error. */
  onError?: (err: ClassifiedError) => void;
  /** Maximum automatic retries before showing fallback. Default: 3. */
  maxRetries?: number;
  children: JSX.Element;
}

// ── Component ────────────────────────────────────────────────────────

export const SmartErrorBoundary: Component<SmartErrorBoundaryProps> = (
  props,
) => {
  const maxRetries = (): number => props.maxRetries ?? 3;
  const [classifiedError, setClassifiedError] =
    createSignal<ClassifiedError | null>(null);
  const [retryCount, setRetryCount] = createSignal(0);
  const [recovering, setRecovering] = createSignal(false);

  // Timeout ids for cleanup
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  onCleanup(() => {
    for (const t of timeouts) clearTimeout(t);
  });

  // ── Recovery Logic ───────────────────────────────────────────────

  async function attemptRecovery(
    classified: ClassifiedError,
    reset: () => void,
  ): Promise<void> {
    const key = errorKey(classified.message, classified.component);

    // If same error repeats too often, stop retrying
    if (isErrorTooFrequent(key, maxRetries(), 60_000)) {
      setClassifiedError(classified);
      return;
    }

    // If we've exhausted retries, show fallback
    if (retryCount() >= maxRetries()) {
      setClassifiedError(classified);
      return;
    }

    setRecovering(true);

    try {
      switch (classified.category) {
        case "network":
        case "server":
        case "rate_limit": {
          // Retry with backoff
          const attempt = retryCount();
          const delay = Math.min(1000 * 2 ** attempt, 10_000);
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, delay);
            timeouts.push(t);
          });
          setRetryCount((c) => c + 1);
          setRecovering(false);
          reset();
          return;
        }

        case "auth": {
          setRecovering(false);
          redirectToAuth();
          return;
        }

        case "validation":
        case "not_found": {
          // Clear caches and retry once
          clearAndRefetch("trpc");
          clearAndRefetch("query");
          if (retryCount() === 0) {
            setRetryCount(1);
            setRecovering(false);
            reset();
            return;
          }
          // Already retried once, show fallback
          setClassifiedError(classified);
          setRecovering(false);
          return;
        }

        case "render": {
          // Try soft reload once, then show fallback
          if (retryCount() === 0) {
            setRetryCount(1);
            setRecovering(false);
            reset();
            return;
          }
          setClassifiedError(classified);
          setRecovering(false);
          return;
        }

        default: {
          // Unknown: single retry then fallback
          if (retryCount() === 0) {
            setRetryCount(1);
            setRecovering(false);
            reset();
            return;
          }
          setClassifiedError(classified);
          setRecovering(false);
          return;
        }
      }
    } catch {
      setClassifiedError(classified);
      setRecovering(false);
    }
  }

  // ── Manual Retry ─────────────────────────────────────────────────

  function manualRetry(reset: () => void): void {
    setClassifiedError(null);
    setRetryCount(0);
    setRecovering(false);
    reset();
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <ErrorBoundary
      fallback={(err: Error, reset: () => void) => {
        const classified = classifyError(err);

        // Fire telemetry callback
        props.onError?.(classified);

        // Attempt automatic recovery (async, fire-and-forget)
        void attemptRecovery(classified, reset);

        return (
          <Show
            when={!recovering()}
            fallback={<RecoveringIndicator />}
          >
            <Show
              when={classifiedError()}
              fallback={<RecoveringIndicator />}
            >
              {(resolvedError) => (
                <Show
                  when={props.fallback}
                  fallback={
                    <DefaultFallback
                      error={resolvedError()}
                      onRetry={() => manualRetry(reset)}
                    />
                  }
                >
                  {(customFallback) =>
                    customFallback()(resolvedError(), () => manualRetry(reset))
                  }
                </Show>
              )}
            </Show>
          </Show>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
};

// ── Recovering Indicator ─────────────────────────────────────────────

function RecoveringIndicator(): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "2rem",
        gap: "0.75rem",
        color: "var(--color-text-secondary, #666)",
      }}
    >
      <div
        style={{
          width: "1.25rem",
          height: "1.25rem",
          border: "2px solid currentColor",
          "border-top-color": "transparent",
          "border-radius": "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span>Attempting recovery...</span>
    </div>
  );
}

// ── Default Fallback UI ──────────────────────────────────────────────

interface DefaultFallbackProps {
  error: ClassifiedError;
  onRetry: () => void;
}

function DefaultFallback(props: DefaultFallbackProps): JSX.Element {
  const isDev = (): boolean => {
    try {
      const meta = import.meta as unknown as Record<
        string,
        Record<string, string> | undefined
      >;
      return meta.env?.DEV === "true" || meta.env?.MODE === "development";
    } catch {
      return false;
    }
  };

  const severityColor = (): string => {
    switch (props.error.severity) {
      case "low":
        return "var(--color-warning, #f59e0b)";
      case "medium":
        return "var(--color-warning, #f59e0b)";
      case "high":
        return "var(--color-error, #ef4444)";
      case "critical":
        return "var(--color-error, #dc2626)";
    }
  };

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        padding: "2rem",
        gap: "1rem",
        "min-height": "200px",
        "border-radius": "0.75rem",
        border: `1px solid ${severityColor()}`,
        "background-color": "var(--color-bg-secondary, #fafafa)",
        "text-align": "center",
      }}
    >
      <div
        style={{
          "font-size": "2rem",
          "line-height": "1",
        }}
      >
        {"\u26A0"}
      </div>

      <div>
        <p
          style={{
            "font-size": "1.125rem",
            "font-weight": "600",
            margin: "0 0 0.5rem",
            color: "var(--color-text-primary, #111)",
          }}
        >
          {props.error.userMessage}
        </p>

        <Show when={isDev()}>
          <div
            style={{
              "margin-top": "1rem",
              padding: "0.75rem",
              "background-color": "var(--color-bg-tertiary, #f3f4f6)",
              "border-radius": "0.5rem",
              "text-align": "left",
              "font-size": "0.8rem",
              "font-family": "monospace",
              color: "var(--color-text-secondary, #555)",
              "max-width": "600px",
              "word-break": "break-word",
            }}
          >
            <p style={{ margin: "0 0 0.25rem" }}>
              <strong>Category:</strong> {props.error.category}
            </p>
            <p style={{ margin: "0 0 0.25rem" }}>
              <strong>Severity:</strong> {props.error.severity}
            </p>
            <p style={{ margin: "0 0 0.25rem" }}>
              <strong>Message:</strong> {props.error.message}
            </p>
            <Show when={props.error.component}>
              <p style={{ margin: "0 0 0.25rem" }}>
                <strong>Component:</strong> {props.error.component}
              </p>
            </Show>
            <Show when={props.error.apiEndpoint}>
              <p style={{ margin: "0 0 0.25rem" }}>
                <strong>Endpoint:</strong> {props.error.apiEndpoint}
              </p>
            </Show>
            <Show when={props.error.statusCode !== undefined}>
              <p style={{ margin: "0" }}>
                <strong>Status:</strong> {props.error.statusCode}
              </p>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={props.error.retryable}>
        <button
          onClick={props.onRetry}
          style={{
            "margin-top": "0.5rem",
            padding: "0.5rem 1.5rem",
            "border-radius": "0.5rem",
            border: "none",
            "background-color": "var(--color-primary, #3b82f6)",
            color: "#fff",
            "font-weight": "600",
            cursor: "pointer",
            "font-size": "0.9rem",
          }}
          type="button"
        >
          Try Again
        </button>
      </Show>

      <Show when={!props.error.retryable}>
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            }
          }}
          style={{
            "margin-top": "0.5rem",
            padding: "0.5rem 1.5rem",
            "border-radius": "0.5rem",
            border: "1px solid var(--color-border, #ddd)",
            "background-color": "transparent",
            color: "var(--color-text-primary, #111)",
            "font-weight": "500",
            cursor: "pointer",
            "font-size": "0.9rem",
          }}
          type="button"
        >
          Reload Page
        </button>
      </Show>
    </div>
  );
}

export default SmartErrorBoundary;
