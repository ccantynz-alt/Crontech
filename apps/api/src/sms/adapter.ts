// SCAFFOLD — not production on its own. This is the pluggable seam for
// SMS delivery. v1 is Sinch-backed via SinchClient; additional providers
// (or an offline stub for tests / dev without a SINCH_API_TOKEN) drop in
// behind this interface.
//
// Shapes are intentionally Sinch-compatible for v1: SinchClient already
// satisfies SmsAdapter structurally, so no call-site change is required
// when we swap implementations.

import type {
  SinchSendResponse,
  SinchMessage,
  SinchListMessagesResponse,
} from "./sinch-types";

export interface SendSmsInput {
  from: string;
  to: string;
  body: string;
  deliveryReport?:
    | "none"
    | "summary"
    | "full"
    | "per_recipient"
    | "per_recipient_final";
  callbackUrl?: string;
}

export interface ListMessagesInput {
  cursor?: string;
  limit?: number;
}

export interface SmsAdapter {
  sendSms(input: SendSmsInput): Promise<SinchSendResponse>;
  getMessage(input: { messageId: string }): Promise<SinchMessage>;
  listMessages(input?: ListMessagesInput): Promise<SinchListMessagesResponse>;
}

/** Env-derived provider choice. Falls back to "stub" when no token is set. */
export type SmsProvider = "sinch" | "stub";

export function smsProviderFromEnv(): SmsProvider {
  const explicit = process.env["SMS_PROVIDER"]?.toLowerCase();
  if (explicit === "stub" || explicit === "sinch") return explicit;
  // Implicit: sinch if token present, otherwise stub so local dev works.
  return process.env["SINCH_API_TOKEN"] ? "sinch" : "stub";
}
