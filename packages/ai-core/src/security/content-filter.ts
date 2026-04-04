import { z } from "zod";

// ── Zod Schemas ─────────────────────────────────────────────────────────

export const ContentFilterResultSchema = z.object({
  /** Whether the content passed all filters */
  safe: z.boolean(),
  /** The filtered content (PII redacted, etc.) */
  filtered: z.string(),
  /** List of flags describing what was detected */
  flags: z.array(z.string()),
});

export type ContentFilterResult = z.infer<typeof ContentFilterResultSchema>;

export const ContentProvenanceSchema = z.object({
  /** The original content */
  content: z.string(),
  /** The AI model that generated it */
  model: z.string(),
  /** ISO 8601 timestamp of generation */
  generatedAt: z.string(),
  /** Content hash for integrity verification */
  contentHash: z.string(),
  /** C2PA-style assertion type */
  assertionType: z.string(),
});

export type ContentProvenance = z.infer<typeof ContentProvenanceSchema>;

// ── PII Detection Patterns ─────────────────────────────────────────────

const PII_PATTERNS: readonly { name: string; pattern: RegExp; replacement: string }[] = [
  {
    name: "email",
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    replacement: "[EMAIL_REDACTED]",
  },
  {
    name: "phone_us",
    // US phone numbers: (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1xxxxxxxxxx
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE_REDACTED]",
  },
  {
    name: "ssn",
    // SSN: xxx-xx-xxxx (with common separators)
    pattern: /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  {
    name: "credit_card",
    // Credit card numbers: 13-19 digit sequences with optional separators
    pattern: /\b(?:\d[-.\s]?){13,19}\b/g,
    replacement: "[CARD_REDACTED]",
  },
  {
    name: "ip_address",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[IP_REDACTED]",
  },
  {
    name: "date_of_birth",
    // Common DOB patterns: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
    pattern: /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
    replacement: "[DOB_REDACTED]",
  },
] as const;

// ── Profanity Patterns ─────────────────────────────────────────────────
// Using word-boundary patterns to avoid false positives.
// This is a minimal set -- extend with a comprehensive list in production.

const PROFANITY_PATTERNS: readonly RegExp[] = [
  /\b(?:fuck|shit|damn|ass|bitch|bastard|crap|dick|piss|cock|cunt|nigger|nigga|faggot|retard)\b/gi,
  /\b(?:fucking|shitting|asshole|bullshit|motherfucker|dumbass|jackass)\b/gi,
] as const;

// ── Copyright / Attribution Markers ────────────────────────────────────

const COPYRIGHT_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  {
    name: "copyright_symbol",
    pattern: /(?:\u00A9|&copy;|\(c\))\s*\d{4}/gi,
  },
  {
    name: "copyright_text",
    pattern: /\bcopyright\s+(?:\d{4}|\(c\))/gi,
  },
  {
    name: "all_rights_reserved",
    pattern: /\ball\s+rights\s+reserved\b/gi,
  },
  {
    name: "trademark",
    pattern: /(?:\u2122|\u00AE|&trade;|&reg;|\(tm\)|\(r\))/gi,
  },
  {
    name: "license_reference",
    pattern: /\b(?:licensed\s+under|subject\s+to\s+the)\s+(?:the\s+)?(?:MIT|GPL|Apache|BSD|Creative\s+Commons|CC\s+BY)/gi,
  },
  {
    name: "attribution_required",
    pattern: /\battribution\s+required\b/gi,
  },
] as const;

// ── Content Filter ─────────────────────────────────────────────────────

/**
 * Filter AI-generated content for PII, profanity, and copyright markers.
 * Returns a result with the filtered content and any flags raised.
 */
export function filterAIOutput(content: string): ContentFilterResult {
  const flags: string[] = [];
  let filtered = content;

  // ── PII Detection & Redaction ──────────────────────────────────────
  for (const { name, pattern, replacement } of PII_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(filtered)) {
      flags.push(`pii:${name}`);
      pattern.lastIndex = 0;
      filtered = filtered.replace(pattern, replacement);
    }
  }

  // ── Profanity Detection ────────────────────────────────────────────
  for (const pattern of PROFANITY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(filtered)) {
      flags.push("profanity");
      pattern.lastIndex = 0;
      filtered = filtered.replace(pattern, "[REDACTED]");
    }
  }

  // ── Copyright Marker Detection ─────────────────────────────────────
  for (const { name, pattern } of COPYRIGHT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(filtered)) {
      flags.push(`copyright:${name}`);
    }
  }

  const safe = flags.length === 0;

  return { safe, filtered, flags };
}

// ── Content Provenance (C2PA-style) ────────────────────────────────────

/**
 * Hash a string using SHA-256 via the Web Crypto API.
 * Falls back to a simple hash in environments without Web Crypto.
 */
async function hashContent(content: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Fallback: simple non-cryptographic hash for environments without Web Crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

/**
 * Add C2PA-style provenance metadata to AI-generated content.
 * Returns a JSON string containing the content with provenance data.
 */
export async function addContentProvenance(
  content: string,
  model: string,
): Promise<string> {
  const generatedAt = new Date().toISOString();
  const contentHash = await hashContent(content);

  const provenance: ContentProvenance = {
    content,
    model,
    generatedAt,
    contentHash,
    assertionType: "c2pa.ai.generated",
  };

  return JSON.stringify(provenance);
}

// ── Utility: Check PII Only ────────────────────────────────────────────

/**
 * Check if content contains PII without modifying it.
 * Returns list of PII types detected.
 */
export function detectPII(content: string): string[] {
  const detected: string[] = [];

  for (const { name, pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      detected.push(name);
    }
  }

  return detected;
}

// ── Utility: Check Profanity Only ──────────────────────────────────────

/**
 * Check if content contains profanity without modifying it.
 */
export function detectProfanity(content: string): boolean {
  return PROFANITY_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}
