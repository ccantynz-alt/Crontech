import type { Context, MiddlewareHandler } from "hono";

// ─── HTML Entity Encoding ───────────────────────────────────────────────────

const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#96;",
};

const HTML_CHAR_RE = /[&<>"'`/]/g;

/**
 * Encode HTML-significant characters to their entity equivalents.
 * Prevents reflected XSS when user input is echoed in responses.
 */
export function encodeHtmlEntities(input: string): string {
  return input.replace(HTML_CHAR_RE, (char) => HTML_ENTITY_MAP[char] ?? char);
}

// ─── SQL Injection Indicators ───────────────────────────────────────────────

/**
 * Patterns that are strong indicators of SQL injection attempts.
 * Drizzle uses parameterized queries, but defense-in-depth means
 * we reject obviously malicious input at the middleware layer.
 */
const SQL_INJECTION_PATTERNS: readonly RegExp[] = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|UNION)\b\s)/i,
  /(\b(OR|AND)\b\s+[\w'"]+\s*=\s*[\w'"]+)/i,
  /(--|#|\/\*)/,
  /;\s*(DROP|ALTER|DELETE|UPDATE|INSERT|EXEC)/i,
  /'\s*(OR|AND)\s+'.*'\s*=\s*'/i,
  /SLEEP\s*\(\s*\d+\s*\)/i,
  /BENCHMARK\s*\(/i,
  /LOAD_FILE\s*\(/i,
  /INTO\s+(OUT|DUMP)FILE/i,
];

/**
 * Returns `true` when the input contains patterns commonly associated
 * with SQL injection. This is a heuristic layer -- parameterized queries
 * in Drizzle remain the primary defense.
 */
export function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

// ─── Path Traversal Prevention ──────────────────────────────────────────────

const PATH_TRAVERSAL_PATTERNS: readonly RegExp[] = [
  /\.\.[/\\]/,
  /[/\\]\.\./,
  /%2e%2e[/\\%]/i,
  /%2f/i,
  /%5c/i,
  /\0/,
];

/**
 * Returns `true` when the input looks like a path traversal attempt.
 */
export function containsPathTraversal(input: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Sanitize a filename by stripping directory components, null bytes,
 * and other dangerous characters. Returns only the basename.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\0/g, "")
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
}

// ─── Deep String Sanitizer ──────────────────────────────────────────────────

/**
 * Recursively walk an unknown value and apply `encodeHtmlEntities` to
 * every string leaf. Returns a structurally identical value with all
 * strings sanitized. Non-string primitives are passed through as-is.
 */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") {
    return encodeHtmlEntities(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeDeep) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeDeep(val);
    }
    return result as T;
  }
  return value;
}

// ─── Validation Result ──────────────────────────────────────────────────────

interface SanitizationViolation {
  field: string;
  reason: "sql_injection" | "path_traversal";
  value: string;
}

/**
 * Scan all string values in an object tree for SQL injection and
 * path traversal patterns. Returns an array of violations (empty if clean).
 */
export function detectViolations(
  obj: unknown,
  parentPath = "",
): SanitizationViolation[] {
  const violations: SanitizationViolation[] = [];

  if (typeof obj === "string") {
    if (containsSqlInjection(obj)) {
      violations.push({
        field: parentPath || "value",
        reason: "sql_injection",
        value: obj.slice(0, 200),
      });
    }
    if (containsPathTraversal(obj)) {
      violations.push({
        field: parentPath || "value",
        reason: "path_traversal",
        value: obj.slice(0, 200),
      });
    }
    return violations;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      violations.push(
        ...detectViolations(obj[i], `${parentPath}[${i}]`),
      );
    }
    return violations;
  }

  if (obj !== null && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const path = parentPath ? `${parentPath}.${key}` : key;
      violations.push(...detectViolations(val, path));
    }
  }

  return violations;
}

// ─── Middleware ──────────────────────────────────────────────────────────────

interface SanitizeMiddlewareOptions {
  /** Maximum allowed request body size in bytes. Default: 1_048_576 (1 MB) */
  maxBodySize?: number;
  /** Block requests that contain SQL injection patterns. Default: true */
  blockSqlInjection?: boolean;
  /** Block requests that contain path traversal patterns. Default: true */
  blockPathTraversal?: boolean;
}

/**
 * Request sanitization middleware.
 *
 * - Validates Content-Length against a configurable maximum.
 * - Scans URL path for path traversal attempts.
 * - For requests with a JSON body, scans all string values for
 *   SQL injection and path traversal indicators.
 * - Rejects with 400 if violations are found.
 */
export function sanitizeMiddleware(
  opts: SanitizeMiddlewareOptions = {},
): MiddlewareHandler {
  const maxBodySize = opts.maxBodySize ?? 1_048_576;
  const blockSqlInjection = opts.blockSqlInjection ?? true;
  const blockPathTraversal = opts.blockPathTraversal ?? true;

  return async (c: Context, next): Promise<Response | void> => {
    // ── Body size check ─────────────────────────────────────────
    const contentLength = c.req.header("content-length");
    if (contentLength !== undefined) {
      const length = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(length) && length > maxBodySize) {
        return c.json(
          { error: "Request body exceeds maximum allowed size" },
          413,
        );
      }
    }

    // ── URL path traversal check ────────────────────────────────
    if (blockPathTraversal && containsPathTraversal(c.req.path)) {
      return c.json({ error: "Invalid request path" }, 400);
    }

    // ── Query string scan ───────────────────────────────────────
    const queryString = c.req.url.split("?")[1];
    if (queryString) {
      const queryViolations = detectViolations(
        Object.fromEntries(new URL(c.req.url).searchParams),
        "query",
      );
      const blocked = queryViolations.filter((v) => {
        if (v.reason === "sql_injection" && blockSqlInjection) return true;
        if (v.reason === "path_traversal" && blockPathTraversal) return true;
        return false;
      });
      if (blocked.length > 0) {
        return c.json(
          { error: "Potentially dangerous input detected", violations: blocked },
          400,
        );
      }
    }

    // ── JSON body scan ──────────────────────────────────────────
    const contentType = c.req.header("content-type");
    if (
      contentType?.includes("application/json") &&
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method)
    ) {
      try {
        const body: unknown = await c.req.json();
        const violations = detectViolations(body, "body");
        const blocked = violations.filter((v) => {
          if (v.reason === "sql_injection" && blockSqlInjection) return true;
          if (v.reason === "path_traversal" && blockPathTraversal) return true;
          return false;
        });
        if (blocked.length > 0) {
          return c.json(
            {
              error: "Potentially dangerous input detected",
              violations: blocked,
            },
            400,
          );
        }
      } catch {
        // Body parse failure -- let downstream handlers deal with it
      }
    }

    await next();
  };
}
