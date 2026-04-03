// ── API Error Wrapper ────────────────────────────────────────────────
//
// Typed error handling for tRPC calls. Parses tRPC error shapes into
// ClassifiedError and provides a helper for automatic error handling.

import { classifyError, type ClassifiedError } from "./error-classifier";
import { retryWithBackoff, type RetryOptions } from "./recovery";

// ── tRPC Error Shape ─────────────────────────────────────────────────

/**
 * Minimal shape of a tRPC error as received by the client.
 * We keep this loose to handle multiple tRPC versions.
 */
interface TRPCErrorShape {
  message: string;
  code?: string;
  data?: {
    code?: string;
    httpStatus?: number;
    path?: string;
    stack?: string;
  };
}

// ── tRPC Code → HTTP Status ──────────────────────────────────────────

const TRPC_CODE_STATUS: Readonly<Record<string, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

// ── Parse tRPC Error ─────────────────────────────────────────────────

function isTRPCError(error: unknown): error is TRPCErrorShape {
  if (error == null || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  return typeof e["message"] === "string" && ("code" in e || "data" in e);
}

/**
 * Normalize a tRPC error into a plain object with statusCode attached
 * so the classifier can use its HTTP-status logic.
 */
function normalizeTRPCError(error: TRPCErrorShape): Record<string, unknown> {
  const httpStatus =
    error.data?.httpStatus ??
    (error.data?.code !== undefined
      ? TRPC_CODE_STATUS[error.data.code]
      : undefined) ??
    (error.code !== undefined ? TRPC_CODE_STATUS[error.code] : undefined);

  return {
    message: error.message,
    statusCode: httpStatus,
    path: error.data?.path,
    code: error.data?.code ?? error.code,
    stack: error.data?.stack,
  };
}

// ── Classify a tRPC Error ────────────────────────────────────────────

/**
 * Classify any error, with special handling for tRPC error shapes.
 */
export function classifyApiError(error: unknown): ClassifiedError {
  if (isTRPCError(error)) {
    const normalized = normalizeTRPCError(error);
    const classified = classifyError(normalized);
    // Preserve the tRPC path as apiEndpoint
    if (typeof normalized["path"] === "string") {
      return { ...classified, apiEndpoint: normalized["path"] as string };
    }
    return classified;
  }

  return classifyError(error);
}

// ── withErrorHandling Wrapper ────────────────────────────────────────

export interface ErrorHandlingOptions {
  /** Override retry behaviour. Set maxRetries to 0 to disable. */
  retry?: Partial<RetryOptions>;
  /** Called when the error is classified (before retry). */
  onError?: (err: ClassifiedError) => void;
  /** If true, rethrow after handling. Default: true. */
  rethrow?: boolean;
}

/**
 * Wrap a tRPC call (or any async function) with automatic error
 * classification and optional retry for retryable errors.
 *
 * ```ts
 * const user = await withErrorHandling(
 *   () => trpc.user.get.query({ id }),
 *   { onError: reportToTelemetry },
 * );
 * ```
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: ErrorHandlingOptions,
): Promise<T> {
  const rethrow = options?.rethrow ?? true;
  const maxRetries = options?.retry?.maxRetries ?? 0;

  try {
    if (maxRetries > 0) {
      return await retryWithBackoff(fn, {
        maxRetries,
        baseDelay: options?.retry?.baseDelay ?? 1000,
        ...options?.retry,
      });
    }
    return await fn();
  } catch (error: unknown) {
    const classified = classifyApiError(error);
    options?.onError?.(classified);

    if (rethrow) {
      throw error;
    }

    // Unreachable when rethrow is true, but satisfies TypeScript
    throw error;
  }
}
