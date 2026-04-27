// ── BLK-030 Crontech Email — queue layer ────────────────────────────
// In-memory queue + JSONL persistence to disk so a process restart
// doesn't lose mail. Single-process — no cross-process locking, single
// writer, single reader. v1 will graduate to packages/queue (BullMQ +
// Redis).

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type { QueueEntry, QueueStatus } from "./types";

// ── Pure helpers (exported for tests) ───────────────────────────────

/**
 * Compute the next-attempt-at timestamp based on attempt count.
 * Exponential back-off: 1m, 5m, 15m, 1h, 4h, 24h, then capped.
 * Returns ISO-8601 in UTC.
 */
export function nextBackoffAt(
  attempts: number,
  fromMs: number = Date.now(),
): string {
  const ladderMinutes = [1, 5, 15, 60, 240, 1440];
  const idx = Math.min(Math.max(attempts - 1, 0), ladderMinutes.length - 1);
  const waitMinutes = ladderMinutes[idx] ?? 1440;
  return new Date(fromMs + waitMinutes * 60_000).toISOString();
}

/**
 * Decide whether a delivery attempt is terminal-failure (no retry),
 * deferrable (try again later), or success.
 *
 * RFC 5321: 2xx = success, 4xx = transient (retry), 5xx = permanent.
 * 0 = TCP connect failure → treat as transient.
 */
export function classifyReply(replyCode: number): QueueStatus {
  if (replyCode >= 200 && replyCode < 300) return "delivered";
  if (replyCode === 0 || (replyCode >= 400 && replyCode < 500)) return "deferred";
  return "failed";
}

/**
 * Pure JSONL line parser — used by both runtime hydration and the test
 * suite. Returns null for malformed lines instead of throwing so a
 * single bad line doesn't kill the whole replay.
 */
export function parseJsonlLine(line: string): QueueEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as Partial<QueueEntry>;
    if (
      typeof obj.id !== "string" ||
      typeof obj.to !== "string" ||
      typeof obj.from !== "string" ||
      typeof obj.subject !== "string" ||
      typeof obj.enqueuedAt !== "string"
    ) {
      return null;
    }
    return obj as QueueEntry;
  } catch {
    return null;
  }
}

// ── Queue class ─────────────────────────────────────────────────────

export interface QueueOptions {
  /** Filesystem path to the JSONL log. Created if missing. */
  jsonlPath: string;
  /** Now() injection seam for tests. */
  nowFn?: () => number;
}

export class EmailQueue {
  private entries = new Map<string, QueueEntry>();
  private idempotencyIndex = new Map<string, string>();
  private readonly jsonlPath: string;
  private readonly now: () => number;

  constructor(opts: QueueOptions) {
    this.jsonlPath = opts.jsonlPath;
    this.now = opts.nowFn ?? Date.now;
    this.ensureJsonlDir();
    this.hydrate();
  }

  /** Enqueue OR return the existing entry id if idempotencyKey matches. */
  enqueue(args: {
    from: string;
    to: string;
    subject: string;
    text: string | null;
    html: string | null;
    replyTo: string | null;
    idempotencyKey: string | null;
  }): QueueEntry {
    if (args.idempotencyKey) {
      const existingId = this.idempotencyIndex.get(args.idempotencyKey);
      if (existingId) {
        const existing = this.entries.get(existingId);
        if (existing) return existing;
      }
    }

    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      idempotencyKey: args.idempotencyKey,
      to: args.to,
      from: args.from,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: args.replyTo,
      enqueuedAt: new Date(this.now()).toISOString(),
      attempts: 0,
      history: [],
      status: "queued",
      nextAttemptAt: null,
    };

    this.entries.set(entry.id, entry);
    if (args.idempotencyKey) {
      this.idempotencyIndex.set(args.idempotencyKey, entry.id);
    }
    this.persist(entry);
    return entry;
  }

  /** Look up an entry by id, undefined if not found. */
  get(id: string): QueueEntry | undefined {
    return this.entries.get(id);
  }

  /** All entries currently eligible for a delivery attempt. */
  takeReady(maxBatch = 16): QueueEntry[] {
    const nowMs = this.now();
    const ready: QueueEntry[] = [];
    for (const e of this.entries.values()) {
      if (ready.length >= maxBatch) break;
      if (e.status === "delivered" || e.status === "failed") continue;
      if (e.status === "sending") continue;
      if (e.nextAttemptAt && Date.parse(e.nextAttemptAt) > nowMs) continue;
      ready.push(e);
    }
    return ready;
  }

  /** Mark an entry as in-flight. */
  markSending(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.status = "sending";
    this.persist(e);
  }

  /** Record a delivery attempt result and update lifecycle state. */
  recordAttempt(
    id: string,
    args: { mxHost: string | null; replyCode: number; replyText: string },
  ): QueueEntry | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;

    const status = classifyReply(args.replyCode);
    e.attempts += 1;
    e.history.push({
      at: new Date(this.now()).toISOString(),
      mxHost: args.mxHost,
      replyCode: args.replyCode,
      replyText: args.replyText.slice(0, 500),
      delivered: status === "delivered",
    });
    e.status = status;
    e.nextAttemptAt = status === "deferred" ? nextBackoffAt(e.attempts, this.now()) : null;
    this.persist(e);
    return e;
  }

  /** Snapshot of the current queue (for /v1/status sweeps + tests). */
  snapshot(): QueueEntry[] {
    return Array.from(this.entries.values());
  }

  // ── private ─────────────────────────────────────────────────────

  private ensureJsonlDir(): void {
    const dir = path.dirname(this.jsonlPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private persist(entry: QueueEntry): void {
    appendFileSync(this.jsonlPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  private hydrate(): void {
    if (!existsSync(this.jsonlPath)) return;
    const content = readFileSync(this.jsonlPath, "utf8");
    for (const line of content.split("\n")) {
      const entry = parseJsonlLine(line);
      if (!entry) continue;
      this.entries.set(entry.id, entry);
      if (entry.idempotencyKey) {
        this.idempotencyIndex.set(entry.idempotencyKey, entry.id);
      }
      // Re-arm any entries that were mid-send when we crashed: bump
      // them back to queued so the worker picks them up on next sweep.
      if (entry.status === "sending") {
        entry.status = "queued";
        entry.nextAttemptAt = null;
      }
    }
  }
}
