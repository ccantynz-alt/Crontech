// ── BLK-030 Crontech Email — SMTP wire-protocol tests ──────────────

import { describe, expect, test } from "bun:test";
import {
  buildMessage,
  deliverViaSmtp,
  extractAddrSpec,
  isReplyTerminator,
  parseReplyCode,
  recipientDomain,
  sortMxByPriority,
  type SmtpSocket,
  type SmtpSocketOpener,
} from "./smtp";

// ── Pure helpers ────────────────────────────────────────────────────

describe("recipientDomain", () => {
  test("extracts domain after @", () => {
    expect(recipientDomain("alice@gmail.com")).toBe("gmail.com");
    expect(recipientDomain("user+tag@example.co.nz")).toBe("example.co.nz");
  });

  test("lowercases the domain (DNS is case-insensitive)", () => {
    expect(recipientDomain("u@EXAMPLE.com")).toBe("example.com");
  });

  test("returns null for malformed addresses", () => {
    expect(recipientDomain("noatsign")).toBeNull();
    expect(recipientDomain("@nolocalpart.com")).toBeNull();
    expect(recipientDomain("trailingat@")).toBeNull();
    expect(recipientDomain("two@signs@example.com")).toBeNull();
    expect(recipientDomain("")).toBeNull();
  });
});

describe("sortMxByPriority", () => {
  test("sorts ascending by priority (lowest = preferred per RFC 5321)", () => {
    const records = [
      { exchange: "high.example.com", priority: 30 },
      { exchange: "low.example.com", priority: 10 },
      { exchange: "mid.example.com", priority: 20 },
    ];
    const sorted = sortMxByPriority(records);
    expect(sorted.map((r) => r.exchange)).toEqual([
      "low.example.com",
      "mid.example.com",
      "high.example.com",
    ]);
  });

  test("returns a new array (does not mutate input)", () => {
    const records = [
      { exchange: "a", priority: 20 },
      { exchange: "b", priority: 10 },
    ];
    const sorted = sortMxByPriority(records);
    expect(records[0]?.exchange).toBe("a");
    expect(sorted[0]?.exchange).toBe("b");
  });
});

describe("parseReplyCode", () => {
  test("extracts the leading 3-digit code", () => {
    expect(parseReplyCode("220 mx.gmail.com ESMTP")).toBe(220);
    expect(parseReplyCode("250-Hello")).toBe(250);
    expect(parseReplyCode("421 4.7.0 try again later")).toBe(421);
    expect(parseReplyCode("550 5.7.1 rejected")).toBe(550);
  });

  test("returns 0 for malformed input (signals transient/unknown)", () => {
    expect(parseReplyCode("")).toBe(0);
    expect(parseReplyCode("ab ")).toBe(0);
    expect(parseReplyCode("garbage")).toBe(0);
    expect(parseReplyCode("9 ok")).toBe(0); // only 1 digit
  });
});

describe("isReplyTerminator", () => {
  test("space after code = final line of reply", () => {
    expect(isReplyTerminator("220 mx.gmail.com ready")).toBe(true);
    expect(isReplyTerminator("250 OK")).toBe(true);
  });

  test("hyphen after code = continuation line, more to come", () => {
    expect(isReplyTerminator("220-greeting line one")).toBe(false);
    expect(isReplyTerminator("250-ENHANCEDSTATUSCODES")).toBe(false);
  });

  test("short lines treated as terminators (defensive)", () => {
    expect(isReplyTerminator("")).toBe(true);
    expect(isReplyTerminator("ok")).toBe(true);
    expect(isReplyTerminator("250")).toBe(true);
  });
});

describe("buildMessage", () => {
  const FIXED_DATE = new Date("2026-04-27T06:00:00Z");

  test("builds plain-text message with required headers", () => {
    const msg = buildMessage({
      from: "Crontech <noreply@crontech.ai>",
      to: "alice@example.com",
      subject: "Welcome",
      text: "Hello world",
      html: null,
      replyTo: null,
      messageId: "msg-1",
      date: FIXED_DATE,
    });
    expect(msg).toContain("From: Crontech <noreply@crontech.ai>");
    expect(msg).toContain("To: alice@example.com");
    expect(msg).toContain("Subject: Welcome");
    expect(msg).toContain("Date: ");
    expect(msg).toContain("Message-ID: <msg-1@crontech.ai>");
    expect(msg).toContain("MIME-Version: 1.0");
    expect(msg).toContain("Content-Type: text/plain; charset=utf-8");
    expect(msg).toContain("Hello world");
    expect(msg.endsWith(".")).toBe(true); // SMTP DATA terminator
  });

  test("builds multipart/alternative when both text and html given", () => {
    const msg = buildMessage({
      from: "x@y.z",
      to: "a@b.c",
      subject: "Both",
      text: "plain version",
      html: "<p>html version</p>",
      replyTo: null,
      messageId: "msg-2",
      date: FIXED_DATE,
    });
    expect(msg).toMatch(/Content-Type: multipart\/alternative; boundary="crontech-msg-2"/);
    expect(msg).toContain("--crontech-msg-2");
    expect(msg).toContain("plain version");
    expect(msg).toContain("<p>html version</p>");
    expect(msg).toContain("--crontech-msg-2--"); // closing boundary
  });

  test("includes Reply-To when set", () => {
    const msg = buildMessage({
      from: "x@y.z",
      to: "a@b.c",
      subject: "rt",
      text: "body",
      html: null,
      replyTo: "support@crontech.ai",
      messageId: "msg-3",
      date: FIXED_DATE,
    });
    expect(msg).toContain("Reply-To: support@crontech.ai");
  });

  test("HTML-only build picks text/html content type", () => {
    const msg = buildMessage({
      from: "x@y.z",
      to: "a@b.c",
      subject: "html",
      text: null,
      html: "<p>hi</p>",
      replyTo: null,
      messageId: "msg-4",
      date: FIXED_DATE,
    });
    expect(msg).toContain("Content-Type: text/html; charset=utf-8");
    expect(msg).not.toContain("multipart/alternative");
  });
});

describe("extractAddrSpec", () => {
  const sample = [
    "From: Crontech <noreply@crontech.ai>",
    "To: alice@example.com",
    "Subject: hi",
    "",
    "body",
  ].join("\r\n");

  test("strips display name and angle brackets", () => {
    expect(extractAddrSpec(sample, "From")).toBe("noreply@crontech.ai");
  });

  test("returns whole value when no angle brackets", () => {
    expect(extractAddrSpec(sample, "To")).toBe("alice@example.com");
  });

  test("returns empty string when header is missing", () => {
    expect(extractAddrSpec(sample, "Cc")).toBe("");
  });
});

// ── deliverViaSmtp — full conversation against a mock socket ────────

interface ScriptedReply {
  /** Lines the server will emit. Caller does NOT need CRLF. */
  serverSays: string[];
  /** Optional: assert the client wrote this string. */
  expectClientWrote?: string;
}

function makeMockSocket(script: ScriptedReply[]): {
  socket: SmtpSocket;
  clientWrites: string[];
} {
  const clientWrites: string[] = [];
  let scriptIdx = 0;
  let pendingResolve: ((r: IteratorResult<string>) => void) | null = null;
  const queue: string[] = [];
  let closed = false;

  const flushPending = (lines: string[]): void => {
    for (const line of lines) {
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r({ value: line, done: false });
      } else {
        queue.push(line);
      }
    }
  };

  // Seed the first reply (server greeting) immediately.
  if (script[0]) {
    flushPending(script[0].serverSays);
    scriptIdx = 1;
  }

  const iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return {
        next(): Promise<IteratorResult<string>> {
          if (queue.length > 0) {
            const v = queue.shift();
            return Promise.resolve({ value: v ?? "", done: false });
          }
          if (closed) {
            return Promise.resolve({ value: "", done: true });
          }
          return new Promise((res) => {
            pendingResolve = res;
          });
        },
        return(): Promise<IteratorResult<string>> {
          closed = true;
          return Promise.resolve({ value: "", done: true });
        },
      };
    },
  };

  const socket: SmtpSocket = {
    readLines: () => iterable,
    write: (data: string) => {
      clientWrites.push(data);
      // Each client write triggers the next scripted reply.
      const next = script[scriptIdx];
      if (next) {
        scriptIdx += 1;
        flushPending(next.serverSays);
      }
    },
    close: () => {
      closed = true;
      if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r({ value: "", done: true });
      }
    },
  };

  return { socket, clientWrites };
}

describe("deliverViaSmtp — happy path", () => {
  test("walks EHLO → MAIL FROM → RCPT TO → DATA → body → 250 delivered", async () => {
    const message = buildMessage({
      from: "noreply@crontech.ai",
      to: "alice@example.com",
      subject: "Welcome",
      text: "hi",
      html: null,
      replyTo: null,
      messageId: "msg-happy",
    });

    const { socket, clientWrites } = makeMockSocket([
      { serverSays: ["220 mx.example.com ESMTP ready"] }, // greeting
      { serverSays: ["250-mx.example.com Hello", "250 OK"] }, // EHLO reply
      { serverSays: ["250 2.1.0 Sender OK"] }, // MAIL FROM
      { serverSays: ["250 2.1.5 Recipient OK"] }, // RCPT TO
      { serverSays: ["354 Start mail input; end with <CRLF>.<CRLF>"] }, // DATA
      { serverSays: ["250 2.0.0 Ok: queued as ABC123"] }, // body terminator
      { serverSays: ["221 2.0.0 Bye"] }, // QUIT
    ]);

    const opener: SmtpSocketOpener = async () => socket;
    const result = await deliverViaSmtp({
      to: "alice@example.com",
      rfc5322Message: message,
      ehloHostname: "test.crontech.ai",
      openSocket: opener,
    });

    expect(result.replyCode).toBe(250);
    expect(result.replyText).toContain("queued as ABC123");

    // Verify the wire conversation
    expect(clientWrites[0]).toBe("EHLO test.crontech.ai\r\n");
    expect(clientWrites[1]).toBe("MAIL FROM:<noreply@crontech.ai>\r\n");
    expect(clientWrites[2]).toBe("RCPT TO:<alice@example.com>\r\n");
    expect(clientWrites[3]).toBe("DATA\r\n");
    expect(clientWrites[4]).toContain("Subject: Welcome");
    expect(clientWrites[5]).toBe("QUIT\r\n");
  });
});

describe("deliverViaSmtp — failure paths", () => {
  test("invalid recipient address → 550 without opening any socket", async () => {
    let openedCount = 0;
    const opener: SmtpSocketOpener = async () => {
      openedCount += 1;
      return makeMockSocket([]).socket;
    };
    const result = await deliverViaSmtp({
      to: "garbage",
      rfc5322Message: "From: x@y.z\r\nTo: garbage\r\n\r\nbody\r\n.",
      ehloHostname: "h",
      openSocket: opener,
    });
    expect(result.replyCode).toBe(550);
    expect(result.replyText).toContain("Invalid recipient");
    expect(openedCount).toBe(0);
  });

  test("server greets with 421 → propagates as deferred-class reply", async () => {
    const { socket } = makeMockSocket([
      { serverSays: ["421 4.7.0 Service not available"] }, // greeting that's a deferral
    ]);
    const opener: SmtpSocketOpener = async () => socket;
    const result = await deliverViaSmtp({
      to: "alice@example.com",
      rfc5322Message: buildMessage({
        from: "x@y.z",
        to: "alice@example.com",
        subject: "s",
        text: "t",
        html: null,
        replyTo: null,
        messageId: "m",
      }),
      ehloHostname: "h",
      openSocket: opener,
    });
    expect(result.replyCode).toBe(421);
  });

  test("server permanently rejects RCPT TO (550) → returns the 550", async () => {
    const { socket } = makeMockSocket([
      { serverSays: ["220 ESMTP"] },
      { serverSays: ["250 OK"] },
      { serverSays: ["250 OK"] },
      { serverSays: ["550 5.1.1 No such user"] }, // RCPT TO rejected
    ]);
    const opener: SmtpSocketOpener = async () => socket;
    const result = await deliverViaSmtp({
      to: "noone@example.com",
      rfc5322Message: buildMessage({
        from: "x@y.z",
        to: "noone@example.com",
        subject: "s",
        text: "t",
        html: null,
        replyTo: null,
        messageId: "m",
      }),
      ehloHostname: "h",
      openSocket: opener,
    });
    expect(result.replyCode).toBe(550);
  });

  test("openSocket throws (TCP connect failure) → returns transient 0", async () => {
    const opener: SmtpSocketOpener = () => {
      throw new Error("ECONNREFUSED");
    };
    // Override DNS by using a domain that resolves to a fallback A record.
    // Pure unit-test path: with no MX available, the function falls
    // back to the domain itself and tries to connect — which our
    // throwing opener rejects.
    const result = await deliverViaSmtp({
      to: "user@nonexistent-domain-for-test.invalid",
      rfc5322Message: buildMessage({
        from: "x@y.z",
        to: "user@nonexistent-domain-for-test.invalid",
        subject: "s",
        text: "t",
        html: null,
        replyTo: null,
        messageId: "m",
      }),
      ehloHostname: "h",
      openSocket: opener,
    });
    expect(result.replyCode).toBe(0);
    expect(result.replyText).toContain("ECONNREFUSED");
  });
});
