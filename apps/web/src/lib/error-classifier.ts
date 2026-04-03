import { z } from "zod";

// ── Error Category & Severity Schemas ────────────────────────────────

export const ErrorCategorySchema = z.enum([
  "network",
  "auth",
  "validation",
  "not_found",
  "rate_limit",
  "server",
  "render",
  "unknown",
]);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

// ── ClassifiedError Schema ───────────────────────────────────────────

export const ClassifiedErrorSchema = z.object({
  category: ErrorCategorySchema,
  severity: ErrorSeveritySchema,
  message: z.string(),
  originalError: z.unknown(),
  statusCode: z.number().int().optional(),
  component: z.string().optional(),
  apiEndpoint: z.string().optional(),
  timestamp: z.number(),
  retryable: z.boolean(),
  userMessage: z.string(),
});

export type ClassifiedError = z.infer<typeof ClassifiedErrorSchema>;

// ── HTTP Status → Category Mapping ───────────────────────────────────

const STATUS_CATEGORY_MAP: ReadonlyMap<number, ErrorCategory> = new Map([
  [400, "validation"],
  [401, "auth"],
  [403, "auth"],
  [404, "not_found"],
  [408, "network"],
  [422, "validation"],
  [429, "rate_limit"],
  [500, "server"],
  [502, "server"],
  [503, "server"],
  [504, "network"],
]);

const STATUS_SEVERITY_MAP: ReadonlyMap<number, ErrorSeverity> = new Map([
  [400, "low"],
  [401, "medium"],
  [403, "medium"],
  [404, "low"],
  [408, "medium"],
  [422, "low"],
  [429, "medium"],
  [500, "high"],
  [502, "high"],
  [503, "high"],
  [504, "medium"],
]);

// ── Message Pattern Matching ─────────────────────────────────────────

interface PatternMatch {
  pattern: RegExp;
  category: ErrorCategory;
  severity: ErrorSeverity;
}

const MESSAGE_PATTERNS: readonly PatternMatch[] = [
  // Network errors
  { pattern: /fetch failed/i, category: "network", severity: "medium" },
  { pattern: /network\s*(error|request)/i, category: "network", severity: "medium" },
  { pattern: /failed to fetch/i, category: "network", severity: "medium" },
  { pattern: /net::ERR_/i, category: "network", severity: "medium" },
  { pattern: /ECONNREFUSED/i, category: "network", severity: "high" },
  { pattern: /ECONNRESET/i, category: "network", severity: "medium" },
  { pattern: /ETIMEDOUT/i, category: "network", severity: "medium" },
  { pattern: /timeout/i, category: "network", severity: "medium" },
  { pattern: /abort/i, category: "network", severity: "low" },

  // Auth errors
  { pattern: /unauthorized/i, category: "auth", severity: "medium" },
  { pattern: /unauthenticated/i, category: "auth", severity: "medium" },
  { pattern: /forbidden/i, category: "auth", severity: "medium" },
  { pattern: /session\s*expired/i, category: "auth", severity: "medium" },
  { pattern: /token\s*(expired|invalid)/i, category: "auth", severity: "medium" },
  { pattern: /not\s*logged\s*in/i, category: "auth", severity: "medium" },

  // Validation errors
  { pattern: /validation/i, category: "validation", severity: "low" },
  { pattern: /invalid\s*(input|data|param)/i, category: "validation", severity: "low" },
  { pattern: /required\s*field/i, category: "validation", severity: "low" },
  { pattern: /zod/i, category: "validation", severity: "low" },

  // Rate limit
  { pattern: /rate\s*limit/i, category: "rate_limit", severity: "medium" },
  { pattern: /too\s*many\s*requests/i, category: "rate_limit", severity: "medium" },
  { pattern: /throttl/i, category: "rate_limit", severity: "medium" },

  // Render errors
  { pattern: /hydration/i, category: "render", severity: "high" },
  { pattern: /render/i, category: "render", severity: "high" },
  { pattern: /component/i, category: "render", severity: "high" },
  { pattern: /is not a function/i, category: "render", severity: "high" },
  { pattern: /cannot read propert/i, category: "render", severity: "high" },
  { pattern: /undefined is not/i, category: "render", severity: "high" },

  // Server errors
  { pattern: /internal\s*server/i, category: "server", severity: "high" },
  { pattern: /server\s*error/i, category: "server", severity: "high" },
  { pattern: /database/i, category: "server", severity: "critical" },
];

// ── User-Friendly Messages ───────────────────────────────────────────

const USER_MESSAGES: Readonly<Record<ErrorCategory, string>> = {
  network: "Unable to connect. Please check your internet connection and try again.",
  auth: "Your session has expired. Please sign in again.",
  validation: "The data provided is invalid. Please check your input.",
  not_found: "The requested resource could not be found.",
  rate_limit: "Too many requests. Please wait a moment and try again.",
  server: "Something went wrong on our end. We're working on it.",
  render: "Something went wrong displaying this page. Please try refreshing.",
  unknown: "An unexpected error occurred. Please try again.",
};

// ── Retryable Categories ─────────────────────────────────────────────

const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "network",
  "server",
  "rate_limit",
]);

// ── Extract Info Helpers ─────────────────────────────────────────────

function extractStatusCode(error: unknown): number | undefined {
  if (error == null || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  // tRPC errors store the HTTP status in various places
  if (typeof err["status"] === "number") return err["status"] as number;
  if (typeof err["statusCode"] === "number") return err["statusCode"] as number;

  // Nested in data/httpStatus (tRPC v11 shape)
  const data = err["data"];
  if (data != null && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d["httpStatus"] === "number") return d["httpStatus"] as number;
    if (typeof d["status"] === "number") return d["status"] as number;
  }

  // Response object
  const response = err["response"];
  if (response != null && typeof response === "object") {
    const r = response as Record<string, unknown>;
    if (typeof r["status"] === "number") return r["status"] as number;
  }

  return undefined;
}

function extractMessage(error: unknown): string {
  if (error == null) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const err = error as Record<string, unknown>;
    if (typeof err["message"] === "string") return err["message"];
  }
  return String(error);
}

function extractComponentName(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;

  // Look for component names in stack trace (PascalCase function names)
  const match = error.stack.match(/at\s+([A-Z][a-zA-Z0-9]+)\s*\(/);
  return match?.[1];
}

function extractApiEndpoint(error: unknown): string | undefined {
  if (error == null || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  // tRPC path
  const path = err["path"];
  if (typeof path === "string") return path;

  // URL in config or request
  const config = err["config"];
  if (config != null && typeof config === "object") {
    const c = config as Record<string, unknown>;
    if (typeof c["url"] === "string") return c["url"];
  }

  return undefined;
}

// ── Main Classifier ──────────────────────────────────────────────────

export function classifyError(error: unknown): ClassifiedError {
  const message = extractMessage(error);
  const statusCode = extractStatusCode(error);
  const component = extractComponentName(error);
  const apiEndpoint = extractApiEndpoint(error);

  let category: ErrorCategory = "unknown";
  let severity: ErrorSeverity = "medium";

  // 1. Try status code first (most reliable signal)
  if (statusCode !== undefined) {
    const statusCategory = STATUS_CATEGORY_MAP.get(statusCode);
    if (statusCategory !== undefined) {
      category = statusCategory;
      severity = STATUS_SEVERITY_MAP.get(statusCode) ?? "medium";
    }
  }

  // 2. If still unknown, try message pattern matching
  if (category === "unknown") {
    for (const { pattern, category: cat, severity: sev } of MESSAGE_PATTERNS) {
      if (pattern.test(message)) {
        category = cat;
        severity = sev;
        break;
      }
    }
  }

  // 3. Check for TypeError / ReferenceError (usually render issues)
  if (category === "unknown" && error instanceof TypeError) {
    category = "render";
    severity = "high";
  }
  if (category === "unknown" && error instanceof ReferenceError) {
    category = "render";
    severity = "high";
  }

  const retryable = RETRYABLE_CATEGORIES.has(category);
  const userMessage = USER_MESSAGES[category];

  return {
    category,
    severity,
    message,
    originalError: error,
    statusCode,
    component,
    apiEndpoint,
    timestamp: Date.now(),
    retryable,
    userMessage,
  };
}
