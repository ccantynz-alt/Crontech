import type { MiddlewareHandler } from "hono";

/**
 * Privacy-related response headers middleware.
 * Adds security and privacy headers required for GDPR compliance
 * and general security best practices.
 */
export function privacyHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
  };
}
