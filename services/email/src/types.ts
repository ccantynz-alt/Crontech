// ── BLK-030 Crontech Email — public types ────────────────────────────
// Shared shape for queue entries, delivery attempts, and the
// REST API request/response envelopes.

import { z } from "zod";

// ── REST request / response schemas ─────────────────────────────────

/**
 * Schema for `POST /v1/send`. Mirror of Mailgun's `/messages` endpoint
 * minus the marketing-specific fields (which belong in BLK-030 v1).
 */
export const SendEmailRequestSchema = z.object({
  /** RFC 5322 mailbox spec (e.g. "Crontech <noreply@crontech.ai>") */
  from: z.string().min(3).max(320),
  /** One or more recipient addresses. Each is one queue entry per recipient. */
  to: z
    .union([z.string().min(3).max(320), z.array(z.string().min(3).max(320))])
    .transform((v) => (Array.isArray(v) ? v : [v])),
  /** Subject line. */
  subject: z.string().min(1).max(998),
  /** Plain-text body. At least one of `text` / `html` MUST be present. */
  text: z.string().optional(),
  /** HTML body. */
  html: z.string().optional(),
  /** Optional Reply-To header. */
  replyTo: z.string().min(3).max(320).optional(),
  /** Idempotency key — duplicate enqueues with the same key are deduped. */
  idempotencyKey: z.string().min(1).max(120).optional(),
});

export type SendEmailRequest = z.infer<typeof SendEmailRequestSchema>;

export interface SendEmailResponse {
  ok: true;
  messageIds: string[];
}

export interface ErrorResponse {
  ok: false;
  error: string;
  detail?: string;
}

// ── Queue entry shape ───────────────────────────────────────────────

export type QueueStatus =
  | "queued"
  | "sending"
  | "delivered"
  | "deferred"
  | "failed";

export interface DeliveryAttempt {
  /** UTC ISO-8601 of when the attempt started. */
  at: string;
  /** Server we connected to (e.g. "mx1.gmail.com:25"). */
  mxHost: string | null;
  /** RFC-5321 reply code from the recipient MX (or 0 if connect failed). */
  replyCode: number;
  /** Trimmed reply body for diagnostics. */
  replyText: string;
  /** Whether this attempt is considered terminal-success. */
  delivered: boolean;
}

export interface QueueEntry {
  /** Server-generated UUIDv4 — the "messageId" returned by /v1/send. */
  id: string;
  /** Idempotency key from the request, if any. */
  idempotencyKey: string | null;
  /** Single recipient (one entry per recipient). */
  to: string;
  /** Mirror of the request fields below. */
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  replyTo: string | null;
  /** UTC ISO-8601 of when the entry was first enqueued. */
  enqueuedAt: string;
  /** Number of delivery attempts made so far. */
  attempts: number;
  /** Append-only history of delivery attempts. */
  history: DeliveryAttempt[];
  /** Current lifecycle status. */
  status: QueueStatus;
  /** UTC ISO-8601 of next scheduled attempt (if status === "deferred"). */
  nextAttemptAt: string | null;
}
