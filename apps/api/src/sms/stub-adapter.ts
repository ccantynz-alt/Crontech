// SCAFFOLD — not production. Offline SmsAdapter used when SMS_PROVIDER=stub
// or when SINCH_API_TOKEN is unset. Records every call in-memory and
// returns deterministic ids so tests + dev environments work without
// the real Sinch credentials.
//
// Production delivery MUST go through SinchClient. The stub never
// hits the network and intentionally claims `status: "sent"` so the
// pipeline can be exercised end-to-end without a provider.

import type {
  SinchSendResponse,
  SinchMessage,
  SinchListMessagesResponse,
} from "./sinch-types";
import type { SmsAdapter, SendSmsInput, ListMessagesInput } from "./adapter";

export interface StubSmsCall {
  kind: "send" | "get" | "list";
  at: number;
  input: unknown;
}

export class StubSmsAdapter implements SmsAdapter {
  private counter = 0;
  private readonly store = new Map<string, SinchMessage>();
  public readonly calls: StubSmsCall[] = [];

  private nextId(): string {
    this.counter += 1;
    return `stub_${this.counter.toString().padStart(6, "0")}`;
  }

  async sendSms(input: SendSmsInput): Promise<SinchSendResponse> {
    this.calls.push({ kind: "send", at: Date.now(), input });
    const id = this.nextId();
    const nowIso = new Date().toISOString();
    const response: SinchSendResponse = {
      id,
      from: input.from,
      to: [input.to],
      body: input.body,
      canceled: false,
      created_at: nowIso,
      modified_at: nowIso,
      number_of_message_parts: 1,
    };
    // Memoise as a SinchMessage so a follow-up getMessage(id) works in
    // tests without hitting the network.
    const stored: SinchMessage = {
      id,
      from: input.from,
      to: [input.to],
      body: input.body,
      status: "Dispatched",
      created_at: nowIso,
      modified_at: nowIso,
      canceled: false,
      number_of_message_parts: 1,
    };
    this.store.set(id, stored);
    return response;
  }

  async getMessage(input: { messageId: string }): Promise<SinchMessage> {
    this.calls.push({ kind: "get", at: Date.now(), input });
    const found = this.store.get(input.messageId);
    if (!found) {
      throw new Error(
        `Stub SMS adapter has no record of message ${input.messageId}.`,
      );
    }
    return found;
  }

  async listMessages(
    input: ListMessagesInput = {},
  ): Promise<SinchListMessagesResponse> {
    this.calls.push({ kind: "list", at: Date.now(), input });
    const all = Array.from(this.store.values());
    const pageSize = input.limit ?? 30;
    const page = all.slice(0, pageSize);
    return {
      batches: page,
      count: all.length,
      page: 0,
      page_size: pageSize,
    };
  }

  /** Test-only: wipe recorded calls + stored messages. */
  reset(): void {
    this.calls.length = 0;
    this.store.clear();
    this.counter = 0;
  }
}
