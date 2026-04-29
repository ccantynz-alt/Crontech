import { Show, ErrorBoundary as SolidErrorBoundary, createSignal } from "solid-js";
import type { JSX, ParentComponent } from "solid-js";

interface AppErrorBoundaryProps {
  /** Optional fallback to show instead of the default error UI */
  fallback?: JSX.Element;
}

/**
 * Application-level error boundary.
 * Catches rendering errors, logs them, and shows a user-friendly recovery UI.
 */
export const AppErrorBoundary: ParentComponent<AppErrorBoundaryProps> = (props) => {
  const [retryCount, setRetryCount] = createSignal(0);

  return (
    <SolidErrorBoundary
      fallback={(err, reset) => {
        const error = err instanceof Error ? err : new Error(String(err));

        // Log the error for observability
        console.error("[ErrorBoundary] Caught rendering error:", error.message);
        if (error.stack) {
          console.error("[ErrorBoundary] Stack trace:", error.stack);
        }

        if (props.fallback) {
          return <>{props.fallback}</>;
        }

        return (
          <div class="error-boundary-container">
            <div class="error-boundary-card">
              <div class="error-boundary-icon">!</div>
              <h2 class="error-boundary-title">Something went wrong</h2>
              <p class="error-boundary-message">
                An unexpected error occurred. You can try again or reload the page.
              </p>
              <Show when={error.message}>
                <p class="error-boundary-detail">{error.message}</p>
              </Show>
              <div class="error-boundary-actions">
                <button
                  class="error-boundary-btn error-boundary-btn-primary"
                  type="button"
                  onClick={() => {
                    setRetryCount((c) => c + 1);
                    console.info(`[ErrorBoundary] Retry attempt ${retryCount() + 1}`);
                    reset();
                  }}
                >
                  Try Again
                </button>
                <button
                  class="error-boundary-btn error-boundary-btn-secondary"
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = "/";
                    }
                  }}
                >
                  Go Home
                </button>
              </div>
            </div>
          </div>
        );
      }}
    >
      {props.children}
    </SolidErrorBoundary>
  );
};

// Re-export for backwards compatibility
export { AppErrorBoundary as AIErrorBoundary };
