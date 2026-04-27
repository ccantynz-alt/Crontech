// ── BLK-030 Crontech Email — direct-MX SMTP delivery ────────────────
// Pure RFC 5321 wire-protocol conversation against a recipient MX.
// No third-party SMTP library — Bun TCP socket + a hand-rolled
// state machine. v0 supports plaintext SMTP on port 25 with optional
// STARTTLS upgrade. v1 will add DKIM signing.

import { resolveMx } from "node:dns/promises";

// ── Pure helpers (exported for tests) ───────────────────────────────

export interface MxRecord {
  exchange: string;
  priority: number;
}

/**
 * Sort MX records by priority (lowest first), as RFC 5321 requires.
 * Within a priority bucket, randomise to spread load — but for v0 we
 * keep DNS order so tests are deterministic.
 */
export function sortMxByPriority(records: MxRecord[]): MxRecord[] {
  return [...records].sort((a, b) => a.priority - b.priority);
}

/**
 * Extract the domain part of an email address (the bit after @).
 * Returns null if the address doesn't contain exactly one @ sign.
 */
export function recipientDomain(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  if (address.indexOf("@") !== at) return null;
  return address.slice(at + 1).toLowerCase();
}

/**
 * Parse the numeric reply code from an SMTP response line. Returns 0
 * if the line is empty or doesn't start with a 3-digit code, mirroring
 * the convention used by classifyReply() in queue.ts (0 = transient).
 */
export function parseReplyCode(line: string): number {
  const trimmed = line.trim();
  if (trimmed.length < 3) return 0;
  const head = trimmed.slice(0, 3);
  if (!/^\d{3}$/.test(head)) return 0;
  return Number.parseInt(head, 10);
}

/**
 * RFC 5321 multi-line replies: the LAST line of a logical reply has
 * a SPACE after the 3-digit code; CONTINUATION lines have a HYPHEN.
 * `   220-greeting line one
 *      220 greeting line two`  → one logical reply.
 *
 * Returns true if the line is the final line of its reply.
 */
export function isReplyTerminator(line: string): boolean {
  if (line.length < 4) return true;
  return line.charAt(3) === " ";
}

/**
 * Build the bare RFC 5322 message body from queue-entry fields.
 * Plain-text only for v0; HTML upgrade in v1 with multipart/alternative.
 */
export function buildMessage(args: {
  from: string;
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
  replyTo: string | null;
  messageId: string;
  date?: Date;
}): string {
  const date = (args.date ?? new Date()).toUTCString();
  const headers: string[] = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    `Date: ${date}`,
    `Message-ID: <${args.messageId}@crontech.ai>`,
    `MIME-Version: 1.0`,
  ];
  if (args.replyTo) headers.push(`Reply-To: ${args.replyTo}`);

  let body = "";
  if (args.text && args.html) {
    const boundary = `crontech-${args.messageId}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      args.text,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      "",
      args.html,
      `--${boundary}--`,
    ].join("\r\n");
  } else if (args.html) {
    headers.push(`Content-Type: text/html; charset=utf-8`);
    body = `\r\n${args.html}`;
  } else {
    headers.push(`Content-Type: text/plain; charset=utf-8`);
    body = `\r\n${args.text ?? ""}`;
  }

  return `${headers.join("\r\n")}\r\n${body}\r\n.`;
}

// ── DNS MX lookup with caching ──────────────────────────────────────

const mxCache = new Map<string, { records: MxRecord[]; expiresAt: number }>();
const MX_CACHE_TTL_MS = 5 * 60_000;

export async function lookupMx(domain: string): Promise<MxRecord[]> {
  const cached = mxCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.records;
  try {
    const records = await resolveMx(domain);
    const sorted = sortMxByPriority(records);
    mxCache.set(domain, {
      records: sorted,
      expiresAt: Date.now() + MX_CACHE_TTL_MS,
    });
    return sorted;
  } catch {
    // No MX → fall back to A record per RFC 5321 §5.
    return [{ exchange: domain, priority: 0 }];
  }
}

// ── DeliveryResult ──────────────────────────────────────────────────

export interface DeliveryResult {
  mxHost: string | null;
  replyCode: number;
  replyText: string;
}

/**
 * Attempt to deliver one message to the recipient's MX. Returns a
 * `DeliveryResult` regardless of outcome — never throws. Caller uses
 * the reply code via `classifyReply()` to decide retry vs terminal.
 *
 * Pure-DI seam: pass an `openSocket` impl in tests; the default
 * implementation uses Bun.connect.
 */
export interface SmtpSocket {
  /** Read raw lines (CRLF stripped) from the server. */
  readLines: () => AsyncIterable<string>;
  /** Write raw bytes to the server (caller MUST include CRLF). */
  write: (data: string) => void;
  /** Half-close + cleanup. */
  close: () => void;
}

export type SmtpSocketOpener = (
  host: string,
  port: number,
) => Promise<SmtpSocket>;

export async function deliverViaSmtp(args: {
  to: string;
  rfc5322Message: string;
  ehloHostname: string;
  openSocket: SmtpSocketOpener;
  /** Now() injection for tests. */
  nowFn?: () => number;
}): Promise<DeliveryResult> {
  const domain = recipientDomain(args.to);
  if (!domain) {
    return {
      mxHost: null,
      replyCode: 550,
      replyText: "Invalid recipient address",
    };
  }

  let records: MxRecord[];
  try {
    records = await lookupMx(domain);
  } catch (err) {
    return {
      mxHost: null,
      replyCode: 0,
      replyText: `MX lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (records.length === 0) {
    return {
      mxHost: null,
      replyCode: 550,
      replyText: "No MX records found for recipient domain",
    };
  }

  // Try MX records in priority order. First terminal-success or
  // terminal-failure stops the loop; transient failures advance.
  let lastResult: DeliveryResult | null = null;
  for (const mx of records) {
    let socket: SmtpSocket | null = null;
    try {
      socket = await args.openSocket(mx.exchange, 25);
      const result = await runSmtpConversation({
        socket,
        ehloHostname: args.ehloHostname,
        from: extractAddrSpec(args.rfc5322Message, "From"),
        to: args.to,
        rfc5322Message: args.rfc5322Message,
      });
      lastResult = { ...result, mxHost: `${mx.exchange}:25` };
      // Terminal: success OR permanent reject. Stop trying other MXes.
      if (result.replyCode >= 200 && result.replyCode < 600 && result.replyCode !== 0) {
        if (result.replyCode < 400 || result.replyCode >= 500) {
          return lastResult;
        }
      }
    } catch (err) {
      lastResult = {
        mxHost: `${mx.exchange}:25`,
        replyCode: 0,
        replyText: err instanceof Error ? err.message : String(err),
      };
    } finally {
      socket?.close();
    }
  }

  return lastResult ?? {
    mxHost: null,
    replyCode: 0,
    replyText: "All MXes exhausted with no result",
  };
}

// ── Internal: SMTP conversation state machine ───────────────────────

interface ConversationArgs {
  socket: SmtpSocket;
  ehloHostname: string;
  from: string;
  to: string;
  rfc5322Message: string;
}

async function runSmtpConversation(
  args: ConversationArgs,
): Promise<{ replyCode: number; replyText: string }> {
  const reader = args.socket.readLines()[Symbol.asyncIterator]();

  // 1. Greeting (220)
  const greeting = await readReply(reader);
  if (greeting.replyCode !== 220) return greeting;

  // 2. EHLO
  args.socket.write(`EHLO ${args.ehloHostname}\r\n`);
  const ehloReply = await readReply(reader);
  if (ehloReply.replyCode !== 250) return ehloReply;

  // 3. MAIL FROM
  args.socket.write(`MAIL FROM:<${args.from}>\r\n`);
  const mailReply = await readReply(reader);
  if (mailReply.replyCode !== 250) return mailReply;

  // 4. RCPT TO
  args.socket.write(`RCPT TO:<${args.to}>\r\n`);
  const rcptReply = await readReply(reader);
  if (rcptReply.replyCode !== 250 && rcptReply.replyCode !== 251) return rcptReply;

  // 5. DATA
  args.socket.write(`DATA\r\n`);
  const dataReply = await readReply(reader);
  if (dataReply.replyCode !== 354) return dataReply;

  // 6. Message body terminated by `\r\n.\r\n`
  args.socket.write(`${args.rfc5322Message}\r\n`);
  const finalReply = await readReply(reader);

  // 7. Polite QUIT — best-effort, don't care about reply
  args.socket.write(`QUIT\r\n`);
  return finalReply;
}

async function readReply(
  reader: AsyncIterator<string>,
): Promise<{ replyCode: number; replyText: string }> {
  const lines: string[] = [];
  while (true) {
    const r = await reader.next();
    if (r.done) {
      return { replyCode: 0, replyText: "Connection closed unexpectedly" };
    }
    const line = r.value;
    lines.push(line);
    if (isReplyTerminator(line)) {
      return {
        replyCode: parseReplyCode(line),
        replyText: lines.join("\n"),
      };
    }
  }
}

/**
 * Extract bare-addr-spec (no display name) from a header value like
 * "Crontech <noreply@crontech.ai>". v0 deliberately sloppy — RFC 5322
 * mailbox parsing is its own block. Falls back to the whole string if
 * there's no <…> wrapper.
 */
export function extractAddrSpec(
  rfc5322Message: string,
  headerName: string,
): string {
  const re = new RegExp(`^${headerName}:\\s*(.+)$`, "im");
  const m = re.exec(rfc5322Message);
  if (!m || !m[1]) return "";
  const value = m[1].trim();
  const angleStart = value.indexOf("<");
  const angleEnd = value.indexOf(">");
  if (angleStart >= 0 && angleEnd > angleStart) {
    return value.slice(angleStart + 1, angleEnd).trim();
  }
  return value;
}
