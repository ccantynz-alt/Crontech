import { type JSX, ErrorBoundary, createSignal } from "solid-js";
import { ErrorRecovery } from "./ErrorRecovery";

export interface AIErrorBoundaryProps {
  fallback?: (err: Error, reset: () => void) => JSX.Element;
  onError?: (error: Error, info: { componentName: string }) => void;
  children: JSX.Element;
}

/**
 * Sanitize an error message for user display.
 * Strips file paths, stack frames, and internal details.
 */
function sanitizeErrorMessage(error: Error): string {
  const msg = error.message ?? "An unexpected error occurred.";
  // Remove file paths (Unix and Windows)
  const sanitized = msg
    .replace(/\/[\w./-]+/g, "[path]")
    .replace(/[A-Z]:\\[\w.\\-]+/g, "[path]");
  // Truncate overly long messages
  if (sanitized.length > 300) {
    return `${sanitized.slice(0, 297)}...`;
  }
  return sanitized;
}

/**
 * Attempt to identify the failing component from an error's stack trace.
 */
function identifyFailingComponent(error: Error): string {
  const stack = error.stack ?? "";
  // Look for component-like function names in the stack:
  // Matches PascalCase identifiers typical of SolidJS components
  const componentMatch = stack.match(
    /at\s+([A-Z][a-zA-Z0-9]+)\s*[\s(]/,
  );
  if (componentMatch?.[1]) {
    return componentMatch[1];
  }
  // Try to extract from "in ComponentName" patterns
  const inMatch = stack.match(/in\s+([A-Z][a-zA-Z0-9]+)/);
  if (inMatch?.[1]) {
    return inMatch[1];
  }
  return "Unknown";
}

/**
 * AI-powered ErrorBoundary component.
 *
 * Catches component errors, logs diagnostics, identifies the failing component,
 * and renders a user-friendly recovery UI with retry capability.
 */
export function AIErrorBoundary(props: AIErrorBoundaryProps): JSX.Element {
  const [retryCount, setRetryCount] = createSignal(0);

  const handleError = (error: Error): void => {
    const componentName = identifyFailingComponent(error);

    console.error(
      `[AIErrorBoundary] Error in component "${componentName}":`,
      error.message,
    );
    console.error("[AIErrorBoundary] Stack trace:", error.stack);

    props.onError?.(error, { componentName });
  };

  return (
    <ErrorBoundary
      fallback={(err: unknown, reset: () => void) => {
        const error =
          err instanceof Error ? err : new Error(String(err));
        handleError(error);

        // If a custom fallback is provided, use it
        if (props.fallback) {
          return props.fallback(error, reset);
        }

        const componentName = identifyFailingComponent(error);
        const sanitizedMessage = sanitizeErrorMessage(error);

        const handleRetry = (): void => {
          setRetryCount((c) => c + 1);
          reset();
        };

        return (
          <ErrorRecovery
            error={sanitizedMessage}
            componentName={componentName}
            retryCount={retryCount()}
            onRetry={handleRetry}
          />
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}
