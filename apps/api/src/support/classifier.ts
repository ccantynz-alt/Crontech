/**
 * Email classifier for the AI support system.
 * Returns category + priority. Falls back to keyword rules if AI is unavailable.
 */

import { z } from "zod";

export const CategorySchema = z.enum([
  "billing",
  "technical",
  "bug",
  "feature",
  "sales",
  "spam",
  "other",
]);
export type Category = z.infer<typeof CategorySchema>;

export const PrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const ClassificationSchema = z.object({
  category: CategorySchema,
  priority: PrioritySchema,
  reasoning: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

interface KeywordRule {
  category: Category;
  keywords: string[];
}

const RULES: KeywordRule[] = [
  {
    category: "billing",
    keywords: [
      "invoice",
      "refund",
      "charge",
      "payment",
      "card",
      "subscription",
      "plan",
      "upgrade",
      "downgrade",
      "cancel",
      "billing",
      "price",
      "vat",
      "tax",
    ],
  },
  {
    category: "bug",
    keywords: [
      "broken",
      "crash",
      "error",
      "exception",
      "stack trace",
      "500",
      "white screen",
      "doesn't work",
      "does not work",
      "bug",
      "fails",
    ],
  },
  {
    category: "technical",
    keywords: [
      "api",
      "webhook",
      "rate limit",
      "integration",
      "sdk",
      "documentation",
      "endpoint",
      "auth",
      "passkey",
      "login",
    ],
  },
  {
    category: "feature",
    keywords: [
      "feature request",
      "would be nice",
      "feature",
      "suggest",
      "idea",
      "wishlist",
      "add support for",
    ],
  },
  {
    category: "sales",
    keywords: [
      "enterprise",
      "demo",
      "quote",
      "procurement",
      "contract",
      "sales",
      "buy for my team",
    ],
  },
  {
    category: "spam",
    keywords: [
      "seo services",
      "rank your website",
      "buy followers",
      "crypto investment",
      "viagra",
      "lottery",
    ],
  },
];

const URGENT_KEYWORDS = [
  "urgent",
  "asap",
  "emergency",
  "production down",
  "outage",
  "critical",
  "immediately",
];
const HIGH_KEYWORDS = ["soon", "blocked", "blocker", "important", "frustrated"];

export function classifyWithRules(
  subject: string,
  body: string,
): Classification {
  const text = `${subject}\n${body}`.toLowerCase();
  let bestCategory: Category = "other";
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;
    for (const k of rule.keywords) {
      if (text.includes(k)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  let priority: Priority = "medium";
  if (URGENT_KEYWORDS.some((k) => text.includes(k))) priority = "urgent";
  else if (HIGH_KEYWORDS.some((k) => text.includes(k))) priority = "high";
  else if (bestCategory === "feature" || bestCategory === "spam")
    priority = "low";

  return {
    category: bestCategory,
    priority,
    reasoning: `Rule-based fallback (matched ${bestScore} keyword${bestScore === 1 ? "" : "s"}).`,
  };
}

export async function classifyEmail(
  subject: string,
  body: string,
): Promise<Classification> {
  // Try AI classification first; fall back to rules on any error.
  try {
    const { generateObject } = await import("ai");
    const { getDefaultModel } = await import("@back-to-the-future/ai-core");
    const model = getDefaultModel();

    const { object } = await generateObject({
      model,
      schema: ClassificationSchema,
      prompt: `Classify the following customer support email.

Subject: ${subject}

Body:
${body}

Return one of these categories: billing, technical, bug, feature, sales, spam, other.
Return one of these priorities: low, medium, high, urgent.
Provide a one-sentence reasoning.`,
    });

    return object;
  } catch (err) {
    console.warn(
      "[support.classifier] AI classification failed, using rule fallback:",
      err instanceof Error ? err.message : err,
    );
    return classifyWithRules(subject, body);
  }
}
