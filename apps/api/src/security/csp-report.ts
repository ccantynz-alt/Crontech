import { Hono } from "hono";
import { z } from "zod";

// ─── CSP Violation Report Schema ────────────────────────────────────────────

/**
 * Schema for the CSP violation report body as defined by the
 * Content-Security-Policy specification (report-uri directive).
 * Browsers POST a JSON object with a "csp-report" key.
 */
const cspReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": z.string().optional(),
    "referrer": z.string().optional(),
    "violated-directive": z.string().optional(),
    "effective-directive": z.string().optional(),
    "original-policy": z.string().optional(),
    "blocked-uri": z.string().optional(),
    "status-code": z.number().optional(),
    "source-file": z.string().optional(),
    "line-number": z.number().optional(),
    "column-number": z.number().optional(),
    "disposition": z.enum(["enforce", "report"]).optional(),
  }),
});

type CspReport = z.infer<typeof cspReportSchema>;

// ─── In-Memory Ring Buffer for Recent Violations ────────────────────────────

interface StoredViolation {
  timestamp: string;
  documentUri: string | undefined;
  violatedDirective: string | undefined;
  effectiveDirective: string | undefined;
  blockedUri: string | undefined;
  sourceFile: string | undefined;
  lineNumber: number | undefined;
  disposition: string | undefined;
  ip: string;
  userAgent: string | undefined;
}

const MAX_STORED_VIOLATIONS = 1000;
const recentViolations: StoredViolation[] = [];

function storeViolation(violation: StoredViolation): void {
  recentViolations.push(violation);
  if (recentViolations.length > MAX_STORED_VIOLATIONS) {
    recentViolations.shift();
  }
}

// ─── Route ──────────────────────────────────────────────────────────────────

export const cspReportRoutes = new Hono();

/**
 * POST /api/security/csp-report
 *
 * Receives Content-Security-Policy violation reports from browsers.
 * Validates the payload with Zod, logs the violation, and stores
 * the last N reports in a ring buffer for dashboard consumption.
 *
 * Responds with 204 No Content on success (browsers expect this).
 */
cspReportRoutes.post("/csp-report", async (c) => {
  const contentType = c.req.header("content-type") ?? "";

  // Browsers send CSP reports as application/csp-report or application/json
  if (
    !contentType.includes("application/csp-report") &&
    !contentType.includes("application/json")
  ) {
    return c.json({ error: "Unsupported content type" }, 415);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = cspReportSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid CSP report format" }, 400);
  }

  const report: CspReport = parsed.data;
  const inner = report["csp-report"];

  const ip =
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";

  const violation: StoredViolation = {
    timestamp: new Date().toISOString(),
    documentUri: inner["document-uri"],
    violatedDirective: inner["violated-directive"],
    effectiveDirective: inner["effective-directive"],
    blockedUri: inner["blocked-uri"],
    sourceFile: inner["source-file"],
    lineNumber: inner["line-number"],
    disposition: inner["disposition"],
    ip,
    userAgent: c.req.header("user-agent"),
  };

  // Log for structured observability (picked up by OpenTelemetry / Grafana)
  console.warn("[CSP-VIOLATION]", JSON.stringify(violation));

  storeViolation(violation);

  // 204 -- browsers expect an empty success response
  return c.body(null, 204);
});

/**
 * GET /api/security/csp-report
 *
 * Returns the most recent CSP violations from the ring buffer.
 * Intended for internal dashboards and observability.
 */
cspReportRoutes.get("/csp-report", (c) => {
  return c.json({
    count: recentViolations.length,
    maxStored: MAX_STORED_VIOLATIONS,
    violations: recentViolations,
  });
});
