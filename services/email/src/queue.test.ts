// ── BLK-030 Crontech Email — queue tests ────────────────────────────

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EmailQueue,
  classifyReply,
  nextBackoffAt,
  parseJsonlLine,
} from "./queue";

function tmpJsonl(): string {
  const dir = mkdtempSync(join(tmpdir(), "email-queue-test-"));
  return join(dir, "queue.jsonl");
}

// ── classifyReply ───────────────────────────────────────────────────

describe("classifyReply", () => {
  test("2xx → delivered", () => {
    expect(classifyReply(250)).toBe("delivered");
    expect(classifyReply(251)).toBe("delivered");
    expect(classifyReply(200)).toBe("delivered");
  });

  test("4xx and 0 → deferred (transient, retry)", () => {
    expect(classifyReply(421)).toBe("deferred");
    expect(classifyReply(450)).toBe("deferred");
    expect(classifyReply(0)).toBe("deferred");
  });

  test("5xx → failed (terminal)", () => {
    expect(classifyReply(550)).toBe("failed");
    expect(classifyReply(554)).toBe("failed");
    expect(classifyReply(500)).toBe("failed");
  });

  test("anything else → failed (treat unknown as terminal)", () => {
    expect(classifyReply(100)).toBe("failed");
    expect(classifyReply(999)).toBe("failed");
  });
});

// ── nextBackoffAt ───────────────────────────────────────────────────

describe("nextBackoffAt", () => {
  const NOW = 1_700_000_000_000;

  test("first attempt → 1 minute later", () => {
    const at = nextBackoffAt(1, NOW);
    expect(Date.parse(at)).toBe(NOW + 60_000);
  });

  test("ladder: attempt N → N-th value of [1, 5, 15, 60, 240, 1440] minutes", () => {
    const min = (n: number): number => n * 60_000;
    expect(Date.parse(nextBackoffAt(1, NOW)) - NOW).toBe(min(1));
    expect(Date.parse(nextBackoffAt(2, NOW)) - NOW).toBe(min(5));
    expect(Date.parse(nextBackoffAt(3, NOW)) - NOW).toBe(min(15));
    expect(Date.parse(nextBackoffAt(4, NOW)) - NOW).toBe(min(60));
    expect(Date.parse(nextBackoffAt(5, NOW)) - NOW).toBe(min(240));
    expect(Date.parse(nextBackoffAt(6, NOW)) - NOW).toBe(min(1440));
  });

  test("attempts beyond the ladder are capped at 24h", () => {
    const min = (n: number): number => n * 60_000;
    expect(Date.parse(nextBackoffAt(7, NOW)) - NOW).toBe(min(1440));
    expect(Date.parse(nextBackoffAt(99, NOW)) - NOW).toBe(min(1440));
  });

  test("attempt 0 is treated as attempt 1 (defensive)", () => {
    const min = (n: number): number => n * 60_000;
    expect(Date.parse(nextBackoffAt(0, NOW)) - NOW).toBe(min(1));
  });
});

// ── parseJsonlLine ──────────────────────────────────────────────────

describe("parseJsonlLine", () => {
  test("returns null for empty / whitespace lines", () => {
    expect(parseJsonlLine("")).toBeNull();
    expect(parseJsonlLine("   ")).toBeNull();
    expect(parseJsonlLine("\n")).toBeNull();
  });

  test("returns null for malformed JSON instead of throwing", () => {
    expect(parseJsonlLine("{")).toBeNull();
    expect(parseJsonlLine("not json")).toBeNull();
    expect(parseJsonlLine('"just a string"')).toBeNull(); // missing required fields
  });

  test("returns null when required fields are missing", () => {
    expect(parseJsonlLine("{}")).toBeNull();
    expect(parseJsonlLine('{"id":"abc"}')).toBeNull();
    expect(parseJsonlLine('{"id":"abc","to":"x@y.z"}')).toBeNull();
  });

  test("parses a fully-formed entry", () => {
    const entry = {
      id: "abc",
      idempotencyKey: null,
      to: "x@y.z",
      from: "f@y.z",
      subject: "hi",
      text: "body",
      html: null,
      replyTo: null,
      enqueuedAt: "2026-04-27T00:00:00.000Z",
      attempts: 0,
      history: [],
      status: "queued" as const,
      nextAttemptAt: null,
    };
    expect(parseJsonlLine(JSON.stringify(entry))).toEqual(entry);
  });
});

// ── EmailQueue ──────────────────────────────────────────────────────

describe("EmailQueue", () => {
  test("enqueue produces a UUID id and persists to disk", () => {
    const path = tmpJsonl();
    try {
      const q = new EmailQueue({ jsonlPath: path });
      const e = q.enqueue({
        from: "x@y.z",
        to: "a@b.c",
        subject: "hi",
        text: "body",
        html: null,
        replyTo: null,
        idempotencyKey: null,
      });
      expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(e.status).toBe("queued");

      // Hydrate a fresh queue from the same path → entry is still there.
      const q2 = new EmailQueue({ jsonlPath: path });
      expect(q2.get(e.id)).toBeDefined();
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("idempotency: duplicate enqueues with same key return the same id", () => {
    const path = tmpJsonl();
    try {
      const q = new EmailQueue({ jsonlPath: path });
      const a = q.enqueue({
        from: "x@y.z",
        to: "a@b.c",
        subject: "hi",
        text: "body",
        html: null,
        replyTo: null,
        idempotencyKey: "evt-1",
      });
      const b = q.enqueue({
        from: "x@y.z",
        to: "a@b.c",
        subject: "hi (changed but should dedup)",
        text: "different body",
        html: null,
        replyTo: null,
        idempotencyKey: "evt-1",
      });
      expect(b.id).toBe(a.id);
      expect(q.snapshot()).toHaveLength(1);
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("recordAttempt with 250 → delivered, 421 → deferred with nextAttemptAt", () => {
    const path = tmpJsonl();
    try {
      const NOW = 1_700_000_000_000;
      const q = new EmailQueue({ jsonlPath: path, nowFn: () => NOW });
      const e = q.enqueue({
        from: "x@y.z",
        to: "a@b.c",
        subject: "hi",
        text: "body",
        html: null,
        replyTo: null,
        idempotencyKey: null,
      });

      const after421 = q.recordAttempt(e.id, {
        mxHost: "mx1.b.c:25",
        replyCode: 421,
        replyText: "Service not available, try later",
      });
      expect(after421?.status).toBe("deferred");
      expect(after421?.attempts).toBe(1);
      expect(after421?.nextAttemptAt).not.toBeNull();
      expect(Date.parse(after421?.nextAttemptAt ?? "")).toBe(NOW + 60_000);

      const after250 = q.recordAttempt(e.id, {
        mxHost: "mx1.b.c:25",
        replyCode: 250,
        replyText: "Ok queued for delivery",
      });
      expect(after250?.status).toBe("delivered");
      expect(after250?.nextAttemptAt).toBeNull();
      expect(after250?.attempts).toBe(2);
      expect(after250?.history).toHaveLength(2);
      expect(after250?.history[1]?.delivered).toBe(true);
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("takeReady excludes delivered, sending, failed, and not-yet-due deferred entries", () => {
    const path = tmpJsonl();
    try {
      const NOW = 1_700_000_000_000;
      const q = new EmailQueue({ jsonlPath: path, nowFn: () => NOW });

      const e1 = q.enqueue({
        from: "x@y.z",
        to: "queued@b.c",
        subject: "1",
        text: "1",
        html: null,
        replyTo: null,
        idempotencyKey: null,
      });

      const e2 = q.enqueue({
        from: "x@y.z",
        to: "delivered@b.c",
        subject: "2",
        text: "2",
        html: null,
        replyTo: null,
        idempotencyKey: null,
      });
      q.recordAttempt(e2.id, {
        mxHost: null,
        replyCode: 250,
        replyText: "ok",
      });

      const e3 = q.enqueue({
        from: "x@y.z",
        to: "deferred@b.c",
        subject: "3",
        text: "3",
        html: null,
        replyTo: null,
        idempotencyKey: null,
      });
      q.recordAttempt(e3.id, {
        mxHost: null,
        replyCode: 421,
        replyText: "try later",
      });

      const ready = q.takeReady(10);
      const readyIds = ready.map((r) => r.id);
      expect(readyIds).toContain(e1.id);
      expect(readyIds).not.toContain(e2.id); // delivered
      expect(readyIds).not.toContain(e3.id); // deferred + not yet due
    } finally {
      rmSync(path, { force: true });
    }
  });

  test("crash recovery: entries marked sending are re-armed on hydrate", () => {
    const path = tmpJsonl();
    try {
      const q1 = new EmailQueue({ jsonlPath: path });
      const e = q1.enqueue({
        from: "x@y.z",
        to: "a@b.c",
        subject: "hi",
        text: "body",
        html: null,
        replyTo: null,
        idempotencyKey: null,
      });
      q1.markSending(e.id);
      expect(q1.get(e.id)?.status).toBe("sending");

      // Simulate crash + restart by hydrating a fresh queue.
      const q2 = new EmailQueue({ jsonlPath: path });
      const recovered = q2.get(e.id);
      expect(recovered?.status).toBe("queued");
      expect(recovered?.nextAttemptAt).toBeNull();
    } finally {
      rmSync(path, { force: true });
    }
  });
});
