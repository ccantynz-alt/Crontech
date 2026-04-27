/**
 * BLK-030 Crontech Email — v0
 *
 * Self-hosted transactional email service. Bun.serve on
 * 127.0.0.1:${EMAIL_SERVICE_PORT ?? 9098} — internal only, never
 * exposed via Caddy. Bearer-token auth via EMAIL_SERVICE_SECRET.
 *
 * Direct-MX SMTP delivery (no relay) — connects to the recipient
 * domain's MX server on port 25 and runs the RFC 5321 conversation.
 *
 * Endpoints:
 *   POST /v1/send         — enqueue a message, returns { ok, messageIds }
 *   GET  /v1/status/:id   — current state of a queue entry
 *   GET  /v1/queue        — snapshot of recent entries (admin)
 *   GET  /health          — liveness probe
 *
 * Per CLAUDE.md §0.7 free action — admin sub-route on a localhost-only
 * service. Unlike adding a public route, this is internal-only.
 */

import path from "node:path";
import { hostname } from "node:os";
import { connect } from "node:net";
import { EmailQueue } from "./queue";
import {
  buildMessage,
  deliverViaSmtp,
  type SmtpSocket,
  type SmtpSocketOpener,
} from "./smtp";
import {
  SendEmailRequestSchema,
  type SendEmailResponse,
  type ErrorResponse,
} from "./types";

const PORT = Number(process.env["EMAIL_SERVICE_PORT"] ?? 9098);
const SECRET = process.env["EMAIL_SERVICE_SECRET"] ?? "";
const APP_DIR = process.env["APP_DIR"] ?? "/opt/crontech";
const EHLO_HOSTNAME = process.env["EMAIL_EHLO_HOSTNAME"] ?? hostname();
const QUEUE_JSONL_PATH = path.join(APP_DIR, "data", "email-queue.jsonl");

if (!SECRET) {
  console.error(
    "[email] EMAIL_SERVICE_SECRET env var is required — refusing to start",
  );
  process.exit(1);
}

// ── Auth ────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function authorised(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && timingSafeEqual(token, SECRET);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Default SMTP socket implementation (Bun TCP) ─────────────────────
// Uses node:net for compatibility — Bun.connect's API surface is more
// volatile across versions, and node:net works identically. Wraps the
// socket as an async-iterable of CRLF-terminated lines so the SMTP
// state machine can `for await (const line of …)` naturally.

const defaultSmtpOpener: SmtpSocketOpener = (host, port) =>
  new Promise<SmtpSocket>((resolve, reject) => {
    const socket = connect({ host, port });
    let buffer = "";
    let resolveNext: ((line: IteratorResult<string>) => void) | null = null;
    const queue: string[] = [];
    let ended = false;

    socket.setTimeout(30_000);
    socket.setEncoding("utf8");

    socket.once("connect", () => {
      const iterable: AsyncIterable<string> = {
        [Symbol.asyncIterator](): AsyncIterator<string> {
          return {
            next(): Promise<IteratorResult<string>> {
              if (queue.length > 0) {
                const v = queue.shift();
                return Promise.resolve({
                  value: v ?? "",
                  done: false,
                });
              }
              if (ended) {
                return Promise.resolve({ value: "", done: true });
              }
              return new Promise((res) => {
                resolveNext = res;
              });
            },
            return(): Promise<IteratorResult<string>> {
              return Promise.resolve({ value: "", done: true });
            },
          };
        },
      };

      const sock: SmtpSocket = {
        readLines: () => iterable,
        write: (data: string) => {
          if (!socket.writable) return;
          socket.write(data);
        },
        close: () => {
          try {
            socket.end();
          } catch {
            /* ignore */
          }
        },
      };
      resolve(sock);
    });

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r({ value: line, done: false });
        } else {
          queue.push(line);
        }
        nl = buffer.indexOf("\n");
      }
    });

    socket.on("error", (err: Error) => {
      ended = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: "", done: true });
      }
      reject(err);
    });

    socket.on("close", () => {
      ended = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: "", done: true });
      }
    });

    socket.on("timeout", () => {
      socket.destroy(new Error("SMTP socket timeout (30s)"));
    });
  });

// ── Queue + delivery worker ─────────────────────────────────────────

const queue = new EmailQueue({ jsonlPath: QUEUE_JSONL_PATH });

const WORKER_INTERVAL_MS = 5_000;
let workerStopHandle: ReturnType<typeof setInterval> | null = null;

async function runWorkerTick(): Promise<void> {
  const ready = queue.takeReady(8);
  for (const entry of ready) {
    queue.markSending(entry.id);
    const message = buildMessage({
      from: entry.from,
      to: entry.to,
      subject: entry.subject,
      text: entry.text,
      html: entry.html,
      replyTo: entry.replyTo,
      messageId: entry.id,
    });
    try {
      const result = await deliverViaSmtp({
        to: entry.to,
        rfc5322Message: message,
        ehloHostname: EHLO_HOSTNAME,
        openSocket: defaultSmtpOpener,
      });
      queue.recordAttempt(entry.id, result);
    } catch (err) {
      queue.recordAttempt(entry.id, {
        mxHost: null,
        replyCode: 0,
        replyText: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function startWorker(): void {
  if (workerStopHandle) return;
  workerStopHandle = setInterval(() => {
    runWorkerTick().catch((err) => {
      console.error("[email:worker] tick failed:", err);
    });
  }, WORKER_INTERVAL_MS);
  // First tick immediately so dev/test loops don't wait 5s for first send.
  runWorkerTick().catch(() => {});
}

// ── Server ──────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",

  async fetch(req): Promise<Response> {
    const { pathname } = new URL(req.url);
    const method = req.method;

    if (pathname === "/health" && method === "GET") {
      return json({ ok: true, queueSize: queue.snapshot().length });
    }

    if (!authorised(req)) {
      return json({ ok: false, error: "unauthorized" } as ErrorResponse, 401);
    }

    if (pathname === "/v1/send" && method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json(
          { ok: false, error: "invalid_json", detail: "Body is not valid JSON" } as ErrorResponse,
          400,
        );
      }

      const parsed = SendEmailRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json(
          {
            ok: false,
            error: "invalid_request",
            detail: parsed.error.message,
          } as ErrorResponse,
          400,
        );
      }
      if (!parsed.data.text && !parsed.data.html) {
        return json(
          {
            ok: false,
            error: "invalid_request",
            detail: "At least one of `text` or `html` is required",
          } as ErrorResponse,
          400,
        );
      }

      const messageIds: string[] = [];
      for (const recipient of parsed.data.to) {
        const entry = queue.enqueue({
          from: parsed.data.from,
          to: recipient,
          subject: parsed.data.subject,
          text: parsed.data.text ?? null,
          html: parsed.data.html ?? null,
          replyTo: parsed.data.replyTo ?? null,
          idempotencyKey: parsed.data.idempotencyKey ?? null,
        });
        messageIds.push(entry.id);
      }
      return json({ ok: true, messageIds } as SendEmailResponse);
    }

    const statusMatch = /^\/v1\/status\/([0-9a-f-]{36})$/.exec(pathname);
    if (statusMatch && method === "GET") {
      const id = statusMatch[1] ?? "";
      const entry = queue.get(id);
      if (!entry) {
        return json({ ok: false, error: "not_found" } as ErrorResponse, 404);
      }
      return json({ ok: true, entry });
    }

    if (pathname === "/v1/queue" && method === "GET") {
      const url = new URL(req.url);
      const limit = Math.min(
        Number.parseInt(url.searchParams.get("limit") ?? "50", 10),
        500,
      );
      const all = queue.snapshot().slice(-limit).reverse();
      return json({ ok: true, entries: all, total: queue.snapshot().length });
    }

    return json({ ok: false, error: "not_found" } as ErrorResponse, 404);
  },
});

startWorker();

console.log(
  `[email] BLK-030 v0 listening on http://127.0.0.1:${PORT} (queue: ${QUEUE_JSONL_PATH}, ehlo: ${EHLO_HOSTNAME})`,
);
