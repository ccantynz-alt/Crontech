// ── Global Error Handler ─────────────────────────────────────────────
//
// Captures unhandled errors and promise rejections, classifies them,
// and dispatches user-facing toasts + telemetry callbacks.

import { classifyError, type ClassifiedError } from "./error-classifier";

// ── Types ────────────────────────────────────────────────────────────

export interface GlobalErrorHandlerOptions {
  /** Called for every captured error. Use for telemetry / logging. */
  onError?: (err: ClassifiedError) => void;
  /** Called when an error should be shown to the user. */
  onToast?: (message: string, severity: ClassifiedError["severity"]) => void;
  /** Suppress console output (useful in tests). */
  silent?: boolean;
}

// ── State ────────────────────────────────────────────────────────────

let installed = false;
let handlerOptions: GlobalErrorHandlerOptions = {};
let originalOnError: OnErrorEventHandler | null = null;
let originalOnUnhandledRejection:
  | ((ev: PromiseRejectionEvent) => void)
  | null = null;

// ── Core Handler ─────────────────────────────────────────────────────

function handleCapturedError(error: unknown, source: string): void {
  const classified = classifyError(error);

  // Dev console output
  if (!handlerOptions.silent) {
    console.error(
      `[Cronix:${source}] ${classified.category}/${classified.severity}: ${classified.message}`,
    );
  }

  // Telemetry callback
  handlerOptions.onError?.(classified);

  // User-facing toast for actionable errors
  if (shouldToast(classified)) {
    handlerOptions.onToast?.(classified.userMessage, classified.severity);
  }
}

/**
 * Determine whether an error warrants a user-visible toast notification.
 * We suppress toasts for low-severity or render errors (the error
 * boundary handles those visually).
 */
function shouldToast(err: ClassifiedError): boolean {
  // Render errors are shown via ErrorBoundary fallback UI
  if (err.category === "render") return false;
  // Low severity validation errors are typically handled inline
  if (err.category === "validation" && err.severity === "low") return false;
  return true;
}

// ── Window Event Handlers ────────────────────────────────────────────

function onWindowError(event: ErrorEvent): void {
  handleCapturedError(event.error ?? event.message, "window.onerror");
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  handleCapturedError(event.reason, "unhandledrejection");
}

// ── Install / Uninstall ──────────────────────────────────────────────

/**
 * Install the global error handler. Safe to call multiple times;
 * subsequent calls update options without re-installing listeners.
 */
export function installGlobalErrorHandler(
  options?: GlobalErrorHandlerOptions,
): void {
  handlerOptions = options ?? {};

  if (typeof window === "undefined") return;

  if (!installed) {
    originalOnError = window.onerror as OnErrorEventHandler | null;
    originalOnUnhandledRejection = null;

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    installed = true;
  }
}

/**
 * Remove the global error handler and restore previous handlers.
 */
export function uninstallGlobalErrorHandler(): void {
  if (typeof window === "undefined") return;

  if (installed) {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);

    if (originalOnError !== null) {
      window.onerror = originalOnError;
    }
    originalOnError = null;
    originalOnUnhandledRejection = null;

    installed = false;
  }

  handlerOptions = {};
}

/**
 * Manually feed an error into the global handler pipeline.
 * Useful when you catch an error yourself but still want classification
 * and telemetry.
 */
export function reportError(error: unknown): ClassifiedError {
  const classified = classifyError(error);
  handleCapturedError(error, "manual");
  return classified;
}
