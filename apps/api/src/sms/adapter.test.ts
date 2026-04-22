// Contract tests for the SMS adapter scaffold. Covers:
//   • StubSmsAdapter honours the SmsAdapter interface
//   • Deterministic id generation
//   • Memoisation of sent messages for follow-up getMessage
//   • listMessages pagination
//   • smsProviderFromEnv fallback logic

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { smsProviderFromEnv, type SmsAdapter } from "./adapter";
import { StubSmsAdapter } from "./stub-adapter";

describe("StubSmsAdapter — SmsAdapter contract", () => {
  let stub: StubSmsAdapter;

  beforeEach(() => {
    stub = new StubSmsAdapter();
  });

  test("structurally satisfies SmsAdapter", () => {
    // Type-level check: compile fails if the class no longer matches.
    const adapter: SmsAdapter = stub;
    expect(typeof adapter.sendSms).toBe("function");
    expect(typeof adapter.getMessage).toBe("function");
    expect(typeof adapter.listMessages).toBe("function");
  });

  test("sendSms returns a deterministic sequential id and records the call", async () => {
    const first = await stub.sendSms({
      from: "+14155551234",
      to: "+14155555678",
      body: "hello 1",
    });
    const second = await stub.sendSms({
      from: "+14155551234",
      to: "+14155555678",
      body: "hello 2",
    });

    expect(first.id).toBe("stub_000001");
    expect(second.id).toBe("stub_000002");
    expect(stub.calls.filter((c) => c.kind === "send").length).toBe(2);
  });

  test("getMessage returns the memoised SinchMessage for a prior send", async () => {
    const sent = await stub.sendSms({
      from: "+14155551234",
      to: "+14155555678",
      body: "round-trip",
    });

    const fetched = await stub.getMessage({ messageId: sent.id });
    expect(fetched.id).toBe(sent.id);
    expect(fetched.body).toBe("round-trip");
    expect(fetched.from).toBe("+14155551234");
    expect(fetched.to).toEqual(["+14155555678"]);
  });

  test("getMessage throws a polite error for unknown ids", async () => {
    await expect(stub.getMessage({ messageId: "stub_999999" })).rejects.toThrow(
      /no record of message stub_999999/,
    );
  });

  test("listMessages returns the in-memory store with default page size 30", async () => {
    for (let i = 0; i < 5; i += 1) {
      await stub.sendSms({
        from: "+14155551234",
        to: "+14155555678",
        body: `msg ${i}`,
      });
    }

    const page = await stub.listMessages();
    expect(page.count).toBe(5);
    expect(page.page_size).toBe(30);
    expect(page.batches?.length).toBe(5);
  });

  test("listMessages honours an explicit limit", async () => {
    for (let i = 0; i < 5; i += 1) {
      await stub.sendSms({
        from: "+14155551234",
        to: "+14155555678",
        body: `msg ${i}`,
      });
    }

    const page = await stub.listMessages({ limit: 2 });
    expect(page.page_size).toBe(2);
    expect(page.batches?.length).toBe(2);
    expect(page.count).toBe(5); // total in store, not page
  });

  test("reset clears counters and storage", async () => {
    await stub.sendSms({
      from: "+14155551234",
      to: "+14155555678",
      body: "before reset",
    });
    stub.reset();

    const after = await stub.sendSms({
      from: "+14155551234",
      to: "+14155555678",
      body: "after reset",
    });
    expect(after.id).toBe("stub_000001");
    expect(stub.calls.length).toBe(1); // only the post-reset send
  });
});

describe("smsProviderFromEnv", () => {
  const originalProvider = process.env["SMS_PROVIDER"];
  const originalToken = process.env["SINCH_API_TOKEN"];

  afterEach(() => {
    if (originalProvider === undefined) delete process.env["SMS_PROVIDER"];
    else process.env["SMS_PROVIDER"] = originalProvider;
    if (originalToken === undefined) delete process.env["SINCH_API_TOKEN"];
    else process.env["SINCH_API_TOKEN"] = originalToken;
  });

  test("returns 'stub' when SMS_PROVIDER=stub even if a token is set", () => {
    process.env["SMS_PROVIDER"] = "stub";
    process.env["SINCH_API_TOKEN"] = "anything";
    expect(smsProviderFromEnv()).toBe("stub");
  });

  test("returns 'sinch' when SMS_PROVIDER=sinch even without a token", () => {
    process.env["SMS_PROVIDER"] = "sinch";
    delete process.env["SINCH_API_TOKEN"];
    expect(smsProviderFromEnv()).toBe("sinch");
  });

  test("implicit: returns 'sinch' when a token is set and no explicit provider", () => {
    delete process.env["SMS_PROVIDER"];
    process.env["SINCH_API_TOKEN"] = "real-token";
    expect(smsProviderFromEnv()).toBe("sinch");
  });

  test("implicit: returns 'stub' when no token and no explicit provider", () => {
    delete process.env["SMS_PROVIDER"];
    delete process.env["SINCH_API_TOKEN"];
    expect(smsProviderFromEnv()).toBe("stub");
  });

  test("ignores case on SMS_PROVIDER", () => {
    process.env["SMS_PROVIDER"] = "STUB";
    expect(smsProviderFromEnv()).toBe("stub");
  });
});
