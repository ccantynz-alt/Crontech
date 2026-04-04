/**
 * Input sanitization utilities for OWASP top 10 protection.
 * Pure TypeScript -- zero external dependencies.
 */

// ── Dangerous HTML tags that can execute scripts or load external content ──

const DANGEROUS_TAGS: readonly string[] = [
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "link",
  "meta",
  "base",
  "svg",
  "math",
  "template",
  "slot",
  "portal",
  "noscript",
] as const;

// ── Dangerous HTML attributes ──────────────────────────────────────────

const DANGEROUS_ATTRS: readonly string[] = [
  "onabort",
  "onblur",
  "onchange",
  "onclick",
  "ondblclick",
  "onerror",
  "onfocus",
  "onhashchange",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onmousedown",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onmousewheel",
  "onpageshow",
  "onpaste",
  "onreset",
  "onresize",
  "onscroll",
  "onsearch",
  "onselect",
  "onsubmit",
  "ontoggle",
  "onunload",
  "onwheel",
  "onpointerdown",
  "onpointermove",
  "onpointerup",
  "onanimationstart",
  "onanimationend",
  "ontransitionend",
  "onbeforeinput",
  "oncontextmenu",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "onfocusin",
  "onfocusout",
  "formaction",
  "xlink:href",
  "data-bind",
] as const;

// ── Dangerous URI schemes ──────────────────────────────────────────────

const DANGEROUS_URI_SCHEMES: readonly string[] = [
  "javascript:",
  "vbscript:",
  "data:text/html",
  "data:application",
] as const;

// ── Private networks for SSRF detection ────────────────────────────────

const PRIVATE_IP_PATTERNS: readonly RegExp[] = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,      // Loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,        // Class A private
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Class B private
  /^192\.168\.\d{1,3}\.\d{1,3}$/,           // Class C private
  /^169\.254\.\d{1,3}\.\d{1,3}$/,           // Link-local
  /^0\.0\.0\.0$/,                            // Unspecified
  /^::1$/,                                    // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                        // IPv6 unique local
  /^fe80:/i,                                  // IPv6 link-local
  /^fd[0-9a-f]{2}:/i,                        // IPv6 unique local
] as const;

const PRIVATE_HOSTNAMES: readonly string[] = [
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",         // GCP metadata
  "metadata.google.com",
  "instance-data",                      // AWS metadata hostname
] as const;

// ── SQL Injection Patterns ─────────────────────────────────────────────

const SQL_INJECTION_PATTERNS: readonly RegExp[] = [
  /('|"|;|--|\/\*|\*\/|xp_|exec\s|execute\s|sp_|0x)/gi,
  /(\b(union|select|insert|update|delete|drop|alter|create|truncate|exec|execute)\b\s)/gi,
  /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,    // OR 1=1 style
  /(\b(or|and)\b\s+'[^']*'\s*=\s*'[^']*')/gi, // OR 'a'='a' style
  /(;\s*(drop|alter|create|truncate|delete|update|insert)\s)/gi,
  /(\bunion\b\s+\ball\b\s+\bselect\b)/gi,
  /(\/\*[\s\S]*?\*\/)/g,                   // Block comments
  /(--[^\n]*)/g,                            // Line comments
  /(\bwaitfor\b\s+\bdelay\b)/gi,          // Time-based injection
  /(\bbenchmark\b\s*\()/gi,               // MySQL benchmark
  /(\bsleep\b\s*\()/gi,                   // MySQL sleep
  /(\bload_file\b\s*\()/gi,               // File read
  /(\binto\b\s+(out|dump)file\b)/gi,       // File write
] as const;

// ── HTML Sanitization ──────────────────────────────────────────────────

/**
 * Strips dangerous HTML tags and attributes from input.
 * Preserves safe formatting tags (b, i, em, strong, p, br, ul, ol, li, h1-h6).
 */
export function sanitizeHTML(input: string): string {
  let result = input;

  // Remove dangerous tags and their contents
  for (const tag of DANGEROUS_TAGS) {
    // Remove opening and closing tags with content for script/iframe/object/embed/style
    const contentRemovalTags = ["script", "iframe", "object", "embed", "applet", "style", "template", "noscript"];
    if (contentRemovalTags.includes(tag)) {
      const contentRegex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
      result = result.replace(contentRegex, "");
    }
    // Remove self-closing and opening tags
    const tagRegex = new RegExp(`<\\/?${tag}[^>]*\\/?>`, "gi");
    result = result.replace(tagRegex, "");
  }

  // Remove dangerous attributes from remaining tags
  for (const attr of DANGEROUS_ATTRS) {
    // Handle attributes with various quote styles and no quotes
    const attrRegex = new RegExp(
      `\\s${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]*)`,
      "gi",
    );
    result = result.replace(attrRegex, "");
  }

  // Remove dangerous URI schemes from href/src/action attributes
  for (const scheme of DANGEROUS_URI_SCHEMES) {
    const schemeEscaped = scheme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const schemeRegex = new RegExp(
      `(href|src|action|poster|background)\\s*=\\s*["']?\\s*${schemeEscaped}`,
      "gi",
    );
    result = result.replace(schemeRegex, '$1="about:blank"');
  }

  // Remove style attributes that could contain expressions
  result = result.replace(
    /\sstyle\s*=\s*(?:"[^"]*(?:expression|javascript|behavior|url\s*\()[^"]*"|'[^']*(?:expression|javascript|behavior|url\s*\()[^']*')/gi,
    "",
  );

  return result;
}

// ── SQL Injection Prevention ───────────────────────────────────────────

/**
 * Escapes SQL injection patterns in user input.
 * NOTE: This is a defense-in-depth measure. Always use parameterized queries
 * (Drizzle ORM) as the primary defense.
 */
export function sanitizeSQL(input: string): string {
  let result = input;

  // Escape single quotes by doubling them
  result = result.replace(/'/g, "''");

  // Escape backslashes
  result = result.replace(/\\/g, "\\\\");

  // Remove null bytes
  result = result.replace(/\0/g, "");

  // Remove SQL comment sequences
  result = result.replace(/--/g, "");
  result = result.replace(/\/\*/g, "");
  result = result.replace(/\*\//g, "");

  // Remove semicolons that could terminate statements
  result = result.replace(/;/g, "");

  return result;
}

/**
 * Detect SQL injection attempts without modifying the input.
 * Returns true if suspicious patterns are found.
 */
export function detectSQLInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

// ── XSS Prevention ────────────────────────────────────────────────────

/**
 * Encodes HTML entities to prevent XSS attacks.
 * This is the safest approach -- encode everything that could be interpreted as HTML.
 */
export function sanitizeXSS(input: string): string {
  let result = input;

  // Encode HTML entities
  result = result.replace(/&/g, "&amp;");
  result = result.replace(/</g, "&lt;");
  result = result.replace(/>/g, "&gt;");
  result = result.replace(/"/g, "&quot;");
  result = result.replace(/'/g, "&#x27;");
  result = result.replace(/\//g, "&#x2F;");
  result = result.replace(/`/g, "&#96;");

  // Remove null bytes
  result = result.replace(/\0/g, "");

  // Encode unicode characters that can be used for XSS bypasses
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return result;
}

// ── SSRF Prevention ────────────────────────────────────────────────────

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF) attacks.
 * Returns true if the URL is safe (not targeting internal resources).
 */
export function validateURL(url: string): boolean {
  // Must be a valid URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Only allow http and https protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  // Block credentials in URL
  if (parsed.username || parsed.password) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private hostnames
  if (PRIVATE_HOSTNAMES.includes(hostname)) {
    return false;
  }

  // Block AWS metadata endpoint
  if (hostname === "169.254.169.254") {
    return false;
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return false;
    }
  }

  // Block numeric IPs encoded as decimal (e.g., http://2130706433 = 127.0.0.1)
  if (/^\d+$/.test(hostname)) {
    return false;
  }

  // Block hex-encoded IPs (e.g., 0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    return false;
  }

  // Block octal-encoded IPs (e.g., 0177.0.0.1)
  if (/^0\d+/.test(hostname)) {
    return false;
  }

  // Block ports commonly used for internal services
  const dangerousPorts = [22, 23, 25, 135, 139, 445, 3306, 5432, 6379, 27017, 9200, 11211];
  const port = parsed.port ? Number.parseInt(parsed.port, 10) : null;
  if (port !== null && dangerousPorts.includes(port)) {
    return false;
  }

  return true;
}

// ── General Input Validation ───────────────────────────────────────────

/**
 * Sanitize a general string input: trim, remove null bytes, limit length.
 */
export function sanitizeInput(input: string, maxLength: number = 10_000): string {
  let result = input;

  // Remove null bytes
  result = result.replace(/\0/g, "");

  // Remove other control characters except whitespace
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Trim whitespace
  result = result.trim();

  // Enforce max length
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  return result;
}

/**
 * Validate and sanitize an email address.
 */
export function sanitizeEmail(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  // Basic email validation (RFC 5322 simplified)
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }
  if (trimmed.length > 254) {
    return null;
  }
  return trimmed;
}

/**
 * Validate a path to prevent path traversal attacks.
 */
export function validatePath(path: string): boolean {
  // Block path traversal sequences
  if (path.includes("..")) return false;
  if (path.includes("~")) return false;

  // Block null bytes
  if (path.includes("\0")) return false;

  // Block absolute paths (Unix and Windows)
  if (path.startsWith("/")) return false;
  if (/^[a-zA-Z]:\\/.test(path)) return false;
  if (path.startsWith("\\\\")) return false;

  // Block URL-encoded traversal
  if (path.includes("%2e%2e") || path.includes("%2E%2E")) return false;
  if (path.includes("%252e")) return false;

  return true;
}
