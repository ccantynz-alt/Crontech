// ── SSE Stream Handler for Support Chat ─────────────────────────────
// Connects to the support chat SSE endpoint, parses streamed tokens
// and tool call events, and handles auto-reconnect on failure.

// ── Types ────────────────────────────────────────────────────────────

export type SSEEventType = "text" | "tool_call" | "tool_result" | "done" | "error";

export interface SSETextEvent {
  type: "text";
  content: string;
}

export interface SSEToolCallEvent {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
}

export interface SSEToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  result: string;
}

export interface SSEDoneEvent {
  type: "done";
  messageId: string;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
  code?: string;
}

export type SSEEvent =
  | SSETextEvent
  | SSEToolCallEvent
  | SSEToolResultEvent
  | SSEDoneEvent
  | SSEErrorEvent;

export interface StreamHandlers {
  onText: (content: string) => void;
  onToolCall: (toolName: string, toolCallId: string) => void;
  onToolResult: (toolCallId: string, result: string) => void;
  onDone: (messageId: string) => void;
  onError: (message: string) => void;
}

export interface StreamOptions {
  sessionId: string;
  message: string;
  handlers: StreamHandlers;
  signal?: AbortSignal;
}

// ── Constants ────────────────────────────────────────────────────────

const SUPPORT_ENDPOINT = "/api/support/chat";
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1000;

// ── Parser ──────────────────────────────────────────────────────────

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith("data: ")) return null;

  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data) as SSEEvent;
    return parsed;
  } catch {
    // Treat unparseable data lines as text content
    return { type: "text", content: data };
  }
}

function dispatchEvent(event: SSEEvent, handlers: StreamHandlers): void {
  switch (event.type) {
    case "text":
      handlers.onText(event.content);
      break;
    case "tool_call":
      handlers.onToolCall(event.toolName, event.toolCallId);
      break;
    case "tool_result":
      handlers.onToolResult(event.toolCallId, event.result);
      break;
    case "done":
      handlers.onDone(event.messageId);
      break;
    case "error":
      handlers.onError(event.message);
      break;
  }
}

// ── Stream Connection ───────────────────────────────────────────────

export async function connectSupportStream(options: StreamOptions): Promise<void> {
  const { sessionId, message, handlers, signal } = options;

  const response = await fetch(SUPPORT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ sessionId, message }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown server error");
    throw new Error(`Support API error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body from support API");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep incomplete last line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const event = parseSSELine(trimmed);
        if (event) {
          dispatchEvent(event, handlers);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseSSELine(buffer.trim());
      if (event) {
        dispatchEvent(event, handlers);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Stream with Auto-Reconnect ──────────────────────────────────────

export async function connectWithRetry(options: StreamOptions): Promise<void> {
  let attempts = 0;

  while (attempts < MAX_RECONNECT_ATTEMPTS) {
    try {
      await connectSupportStream(options);
      return; // Success
    } catch (err) {
      // Don't retry on abort
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      attempts++;

      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        const message = err instanceof Error ? err.message : "Connection failed";
        options.handlers.onError(`${message} (after ${attempts} attempts)`);
        return;
      }

      // Exponential backoff
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempts - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ── Feedback Submission ─────────────────────────────────────────────

export async function submitMessageFeedback(
  sessionId: string,
  messageId: string,
  rating: "up" | "down",
): Promise<void> {
  const response = await fetch("/api/support/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, messageId, rating }),
  });

  if (!response.ok) {
    throw new Error(`Feedback submission failed: ${response.status}`);
  }
}

// ── Escalation Request ──────────────────────────────────────────────

export async function requestEscalation(sessionId: string): Promise<{ ticketId: string }> {
  const response = await fetch("/api/support/escalate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error(`Escalation request failed: ${response.status}`);
  }

  return response.json() as Promise<{ ticketId: string }>;
}
