import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";

// ─── Configuration ──────────────────────────────────────────────────────────

interface SecurityHeadersOptions {
  /** CSP report URI path. Default: "/api/security/csp-report" */
  cspReportUri?: string;
  /** Enable report-only mode for CSP (no enforcement, just reporting). Default: false */
  cspReportOnly?: boolean;
  /** Additional CSP directives to merge with defaults */
  cspOverrides?: Partial<Record<string, string>>;
  /** Maximum request body size in bytes. Default: 1_048_576 (1 MB) */
  maxBodySize?: number;
  /** HSTS max-age in seconds. Default: 63_072_000 (2 years) */
  hstsMaxAge?: number;
}

interface CsrfOptions {
  /** Cookie name for CSRF token. Default: "__csrf" */
  cookieName?: string;
  /** Header name the client sends the token in. Default: "x-csrf-token" */
  headerName?: string;
  /** HTTP methods exempt from CSRF validation */
  safeMethods?: ReadonlySet<string>;
  /** Path prefixes excluded from CSRF checks (e.g. webhook receivers) */
  excludePaths?: readonly string[];
}

// ─── Default CSP Directives ─────────────────────────────────────────────────

const DEFAULT_CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": "'self' 'wasm-unsafe-eval'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob:",
  "font-src": "'self' data:",
  "connect-src": "'self' wss: https:",
  "media-src": "'self' blob:",
  "object-src": "'none'",
  "frame-src": "'none'",
  "frame-ancestors": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "worker-src": "'self' blob:",
  "child-src": "'self' blob:",
  "upgrade-insecure-requests": "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCspString(
  directives: Record<string, string>,
  reportUri?: string,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(directives)) {
    parts.push(value ? `${key} ${value}` : key);
  }
  if (reportUri) {
    parts.push(`report-uri ${reportUri}`);
  }
  return parts.join("; ");
}

/**
 * Generate a cryptographically random token for CSRF protection.
 * Uses Web Crypto API which is available in Bun, Cloudflare Workers,
 * and all modern runtimes.
 */
function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Security Headers Middleware ────────────────────────────────────────────

/**
 * Comprehensive security headers middleware covering OWASP Top 10
 * recommendations for HTTP response headers.
 *
 * Sets: CSP, HSTS, X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy, Permissions-Policy, and Cache-Control for
 * sensitive responses.
 */
export function securityHeaders(
  opts: SecurityHeadersOptions = {},
): MiddlewareHandler {
  const cspReportUri = opts.cspReportUri ?? "/api/security/csp-report";
  const cspReportOnly = opts.cspReportOnly ?? false;
  const maxBodySize = opts.maxBodySize ?? 1_048_576; // 1 MB
  const hstsMaxAge = opts.hstsMaxAge ?? 63_072_000; // 2 years

  const mergedDirectives: Record<string, string> = { ...DEFAULT_CSP_DIRECTIVES };
  if (opts.cspOverrides) {
    for (const [key, value] of Object.entries(opts.cspOverrides)) {
      if (value !== undefined) {
        mergedDirectives[key] = value;
      }
    }
  }
  const cspValue = buildCspString(mergedDirectives, cspReportUri);

  const cspHeader = cspReportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  return async (c: Context, next): Promise<Response | void> => {
    // ── Request-phase: body size guard ────────────────────────────
    const contentLength = c.req.header("content-length");
    if (contentLength !== undefined) {
      const length = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(length) && length > maxBodySize) {
        return c.json(
          { error: "Request body too large", maxBytes: maxBodySize },
          413,
        );
      }
    }

    await next();

    // ── Response-phase: security headers ─────────────────────────
    c.header(cspHeader, cspValue);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header(
      "Strict-Transport-Security",
      `max-age=${hstsMaxAge}; includeSubDomains; preload`,
    );
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    );
    c.header("X-DNS-Prefetch-Control", "off");
    c.header("X-Download-Options", "noopen");
    c.header("X-Permitted-Cross-Domain-Policies", "none");

    // Prevent caching of authenticated / sensitive responses
    if (c.res.status !== 200 || c.req.header("authorization")) {
      c.header(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      c.header("Pragma", "no-cache");
    }
  };
}

// ─── CSRF Protection Middleware (Double-Submit Cookie) ───────────────────────

const DEFAULT_SAFE_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * On every response a random token is set in a cookie. For state-changing
 * requests (POST, PUT, PATCH, DELETE) the client must echo the token
 * back in a custom header. Because a cross-origin page cannot read the
 * cookie value (SameSite + HttpOnly is NOT set so JS can read it),
 * an attacker cannot forge the header.
 */
export function csrfProtection(opts: CsrfOptions = {}): MiddlewareHandler {
  const cookieName = opts.cookieName ?? "__csrf";
  const headerName = opts.headerName ?? "x-csrf-token";
  const safeMethods = opts.safeMethods ?? DEFAULT_SAFE_METHODS;
  const excludePaths = opts.excludePaths ?? [];

  return async (c: Context, next): Promise<Response | void> => {
    // Skip CSRF for excluded paths (webhooks, CSP reports, etc.)
    const path = c.req.path;
    const isExcluded = excludePaths.some((prefix) => path.startsWith(prefix));

    if (!isExcluded && !safeMethods.has(c.req.method)) {
      const cookieToken = getCookie(c, cookieName);
      const headerToken = c.req.header(headerName);

      if (
        !cookieToken ||
        !headerToken ||
        cookieToken !== headerToken ||
        cookieToken.length < 32
      ) {
        return c.json({ error: "CSRF token missing or invalid" }, 403);
      }
    }

    await next();

    // Always issue a fresh CSRF token cookie.
    // httpOnly is intentionally false so client JS can read and send it
    // back as a header.
    const token = generateCsrfToken();
    setCookie(c, cookieName, token, {
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Strict",
    });
  };
}
