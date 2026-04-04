import {
  computeTierRouter,
  getDefaultModel,
  searchSimilar,
  createQdrantClient,
  type SearchHit,
} from "@back-to-the-future/ai-core";
import type { Email, Thread, AIClassification } from "./email-types";
import { AIClassificationSchema } from "./email-types";

/**
 * Classify an email into a category using AI.
 * Routes through the three-tier compute model (client GPU -> edge -> cloud).
 * Returns an AIClassification with category, confidence, reasoning, labels, and priority.
 */
export async function classifyEmail(email: Email): Promise<AIClassification> {
  const tier = computeTierRouter({
    webgpu: false,
    maxModelSizeB: 2,
    availableVRAMGB: 0,
    connectionType: "4g",
    hardwareConcurrency: navigator?.hardwareConcurrency ?? 4,
  });

  const model = getDefaultModel();

  const prompt = [
    "Classify this email into exactly one category: important, newsletter, social, promotions, spam, updates, finance, travel.",
    "Also determine priority (high/medium/low), whether action is required, and suggest labels.",
    "",
    `From: ${email.from.name} <${email.from.email}>`,
    `Subject: ${email.subject}`,
    `Body: ${email.bodyText.slice(0, 1000)}`,
    "",
    "Respond with JSON matching this schema:",
    '{ "category": string, "confidence": number 0-1, "reasoning": string, "suggestedLabels": string[], "priority": "high"|"medium"|"low", "isActionRequired": boolean }',
  ].join("\n");

  const response = await fetch("/api/ai/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, tier: tier.tier }),
  });

  const data: unknown = await response.json();
  return AIClassificationSchema.parse(data);
}

/**
 * Generate three reply suggestions for an email thread using AI.
 * Analyzes thread context to produce contextually relevant replies.
 */
export async function suggestReply(thread: Thread): Promise<string[]> {
  const lastEmails = thread.emails.slice(-3);
  const context = lastEmails
    .map(
      (e) =>
        `From: ${e.from.name}\nSubject: ${e.subject}\n${e.bodyText.slice(0, 500)}`,
    )
    .join("\n---\n");

  const prompt = [
    "Generate exactly 3 short reply suggestions for this email thread.",
    "Each reply should be a different tone: professional, friendly, and brief.",
    "Return a JSON array of 3 strings.",
    "",
    context,
  ].join("\n");

  const response = await fetch("/api/ai/suggest-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length !== 3) {
    return [
      "Thank you for your email. I will review and get back to you shortly.",
      "Thanks for reaching out! Let me take a look and follow up soon.",
      "Noted. Will reply with details shortly.",
    ];
  }
  return data as string[];
}

/**
 * Summarize a long email thread into a concise overview.
 * Uses AI to extract key points, decisions, and action items.
 */
export async function summarizeThread(thread: Thread): Promise<string> {
  const fullThread = thread.emails
    .map(
      (e) =>
        `[${e.sentAt}] ${e.from.name}: ${e.bodyText.slice(0, 800)}`,
    )
    .join("\n---\n");

  const prompt = [
    "Summarize this email thread in 2-4 sentences.",
    "Highlight key decisions, action items, and deadlines.",
    "",
    `Subject: ${thread.subject}`,
    `Participants: ${thread.participants.map((p) => p.name).join(", ")}`,
    `Messages: ${thread.messageCount}`,
    "",
    fullThread,
  ].join("\n");

  const response = await fetch("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const data: unknown = await response.json();
  if (typeof data === "object" && data !== null && "summary" in data) {
    return (data as { summary: string }).summary;
  }
  return String(data);
}

/**
 * Semantic search across emails using vector similarity.
 * Uses Qdrant vector search through ai-core for meaning-based matching,
 * falling back to keyword search when vectors are unavailable.
 */
export async function smartSearch(
  query: string,
  emails: Email[],
): Promise<Email[]> {
  try {
    const response = await fetch("/api/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const data: unknown = await response.json();
    if (Array.isArray(data)) {
      const matchedIds = new Set(
        (data as Array<{ id: string }>).map((hit) => hit.id),
      );
      return emails.filter((e) => matchedIds.has(e.id));
    }
  } catch {
    // Fall back to local keyword search
  }

  const lowerQuery = query.toLowerCase();
  return emails.filter(
    (email) =>
      email.subject.toLowerCase().includes(lowerQuery) ||
      email.bodyText.toLowerCase().includes(lowerQuery) ||
      email.from.name.toLowerCase().includes(lowerQuery) ||
      email.from.email.toLowerCase().includes(lowerQuery),
  );
}
