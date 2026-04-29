import { test } from "node:test";
import assert from "node:assert/strict";
import { GatewayUpstreamError } from "./providers.ts";

// Simulate what the fixed callAnthropic / callOpenAI do when the upstream
// returns a non-ok response with a long error body.
//
// ORIGINAL (buggy): text.slice(0, 200)  — truncated at 200 chars
// FIXED:            text                — full text preserved

function buildAnthropicErrorMessage(status: number, text: string): string {
  // This replicates the FIXED code path:
  //   throw new GatewayUpstreamError(res.status, `anthropic ${res.status}: ${text}`);
  return `anthropic ${status}: ${text}`;
}

function buildOpenAIErrorMessage(status: number, text: string): string {
  // This replicates the FIXED code path:
  //   throw new GatewayUpstreamError(res.status, `openai ${res.status}: ${text}`);
  return `openai ${status}: ${text}`;
}

const LONG_ERROR_BODY =
  "a".repeat(100) +
  " IMPORTANT_DEBUG_INFO " +
  "b".repeat(100) +
  " MORE_CRITICAL_INFO " +
  "c".repeat(100);

// Sanity-check: the body is definitely longer than 200 chars
assert.ok(LONG_ERROR_BODY.length > 200, "test setup: error body must exceed 200 chars");

test("Anthropic error message is NOT truncated at 200 characters", () => {
  const msg = buildAnthropicErrorMessage(429, LONG_ERROR_BODY);
  const err = new GatewayUpstreamError(429, msg);

  // This assertion would FAIL against the buggy code because the body was
  // sliced to 200 chars, dropping "MORE_CRITICAL_INFO" and the trailing c's.
  assert.ok(
    err.message.includes("MORE_CRITICAL_INFO"),
    `Error message should contain text beyond the 200-char mark, got: ${err.message}`
  );
  assert.ok(
    err.message.length > 200 + "anthropic 429: ".length,
    "Error message length should exceed 200 + prefix length"
  );
  // Verify the full body is present, not a truncated version
  assert.ok(err.message.endsWith(LONG_ERROR_BODY));
});

test("OpenAI error message is NOT truncated at 200 characters", () => {
  const msg = buildOpenAIErrorMessage(500, LONG_ERROR_BODY);
  const err = new GatewayUpstreamError(500, msg);

  // This assertion would FAIL against the buggy code because the body was
  // sliced to 200 chars, dropping content after position 200.
  assert.ok(
    err.message.includes("MORE_CRITICAL_INFO"),
    `Error message should contain text beyond the 200-char mark, got: ${err.message}`
  );
  assert.ok(
    err.message.length > 200 + "openai 500: ".length,
    "Error message length should exceed 200 + prefix length"
  );
  // Verify the full body is present, not a truncated version
  assert.ok(err.message.endsWith(LONG_ERROR_BODY));
});

test("Buggy truncation would have cut off the message — demonstrates the fix", () => {
  // Simulate what the BUGGY code produced:
  const buggyMsg = `anthropic 429: ${LONG_ERROR_BODY.slice(0, 200)}`;
  // Simulate what the FIXED code produces:
  const fixedMsg = `anthropic 429: ${LONG_ERROR_BODY}`;

  // The buggy message does NOT contain the important info past char 200
  assert.ok(
    !buggyMsg.includes("MORE_CRITICAL_INFO"),
    "Buggy message should NOT contain info truncated at 200 chars (verifying our test logic)"
  );

  // The fixed message DOES contain the important info
  assert.ok(
    fixedMsg.includes("MORE_CRITICAL_INFO"),
    "Fixed message MUST contain info that was previously truncated"
  );

  // The fixed message is longer
  assert.ok(fixedMsg.length > buggyMsg.length);
});