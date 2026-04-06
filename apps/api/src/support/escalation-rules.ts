/**
 * Escalation rules for the AI support system.
 * Any keyword match forces a human review regardless of AI confidence.
 */

export const ESCALATION_KEYWORDS: readonly string[] = [
  "legal",
  "lawyer",
  "attorney",
  "sue",
  "lawsuit",
  "refund",
  "chargeback",
  "angry",
  "furious",
  "scam",
  "fraud",
  "fraudulent",
  "gdpr request",
  "ccpa request",
  "cancel account",
  "delete my account",
  "data deletion",
  "data breach",
  "security breach",
  "press",
  "journalist",
  "media inquiry",
  "discrimination",
  "harassment",
];

export function shouldEscalate(text: string): boolean {
  const normalized = text.toLowerCase();
  for (const keyword of ESCALATION_KEYWORDS) {
    if (normalized.includes(keyword)) return true;
  }
  return false;
}
