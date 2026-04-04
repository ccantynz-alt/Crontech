// ── Support Store ────────────────────────────────────────────────────
// Signal-based support chat state. Uses module-level signals following
// the SolidJS pattern for global reactive state. Persists session to
// sessionStorage so conversations survive page navigations.

import { type Accessor, createSignal } from "solid-js";
import {
  connectWithRetry,
  submitMessageFeedback,
  requestEscalation,
  type StreamHandlers,
} from "../lib/support-stream";

// ── Types ────────────────────────────────────────────────────────────

export type SupportMessageRole = "user" | "assistant" | "system";
export type SupportAgentMode = "ai" | "human";
export type FeedbackRating = "up" | "down";

export interface ToolCallInfo {
  toolName: string;
  toolCallId: string;
  result?: string;
}

export interface SupportMessage {
  id: string;
  role: SupportMessageRole;
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  feedback?: FeedbackRating;
  pending?: boolean;
}

// ── Session Persistence ─────────────────────────────────────────────

const SESSION_KEY = "cronix_support_session";
const MESSAGES_KEY = "cronix_support_messages";

function loadSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
  } catch {
    // sessionStorage unavailable
  }
  const id = `support-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // Ignore storage errors
  }
  return id;
}

function loadMessages(): SupportMessage[] {
  try {
    const stored = sessionStorage.getItem(MESSAGES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SupportMessage[];
      // Filter out any pending messages from a previous session
      return parsed.filter((m) => !m.pending);
    }
  } catch {
    // Parse error or storage unavailable
  }
  return [];
}

function persistMessages(msgs: SupportMessage[]): void {
  try {
    sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs));
  } catch {
    // Ignore storage errors
  }
}

// ── Signals ─────────────────────────────────────────────────────────

const [messages, setMessages] = createSignal<SupportMessage[]>(loadMessages());
const [isOpen, setIsOpen] = createSignal<boolean>(false);
const [isStreaming, setIsStreaming] = createSignal<boolean>(false);
const [sessionId, setSessionId] = createSignal<string>(loadSessionId());
const [agentMode, setAgentMode] = createSignal<SupportAgentMode>("ai");
const [error, setError] = createSignal<string | null>(null);
const [unreadCount, setUnreadCount] = createSignal<number>(0);

let abortController: AbortController | null = null;

// ── Internal Helpers ────────────────────────────────────────────────

function updateMessages(updater: (prev: SupportMessage[]) => SupportMessage[]): void {
  setMessages((prev) => {
    const next = updater(prev);
    persistMessages(next);
    return next;
  });
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Actions ─────────────────────────────────────────────────────────

function toggleOpen(): void {
  setIsOpen((prev) => !prev);
  if (isOpen()) {
    setUnreadCount(0);
  }
}

function open(): void {
  setIsOpen(true);
  setUnreadCount(0);
}

function close(): void {
  setIsOpen(false);
}

function sendMessage(text: string): void {
  const content = text.trim();
  if (!content || isStreaming()) return;

  setError(null);

  // Add user message
  const userMessage: SupportMessage = {
    id: generateId("user"),
    role: "user",
    content,
    timestamp: Date.now(),
  };
  updateMessages((prev) => [...prev, userMessage]);

  // Create placeholder assistant message
  const assistantId = generateId("assistant");
  const assistantMessage: SupportMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    toolCalls: [],
    pending: true,
  };
  updateMessages((prev) => [...prev, assistantMessage]);

  setIsStreaming(true);

  // Set up abort controller
  abortController = new AbortController();

  const handlers: StreamHandlers = {
    onText(chunk: string): void {
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + chunk } : m,
        ),
      );
    },
    onToolCall(toolName: string, toolCallId: string): void {
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                toolCalls: [...(m.toolCalls ?? []), { toolName, toolCallId }],
              }
            : m,
        ),
      );
    },
    onToolResult(toolCallId: string, result: string): void {
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.toolCallId === toolCallId ? { ...tc, result } : tc,
                ),
              }
            : m,
        ),
      );
    },
    onDone(_messageId: string): void {
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, pending: false } : m,
        ),
      );
      setIsStreaming(false);
      abortController = null;

      // Increment unread if widget is closed
      if (!isOpen()) {
        setUnreadCount((prev) => prev + 1);
      }
    },
    onError(message: string): void {
      setIsStreaming(false);
      setError(message);
      abortController = null;

      updateMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content || `Sorry, something went wrong: ${message}`,
                pending: false,
              }
            : m,
        ),
      );
    },
  };

  void connectWithRetry({
    sessionId: sessionId(),
    message: content,
    handlers,
    signal: abortController.signal,
  });
}

function cancelStream(): void {
  abortController?.abort();
  abortController = null;
  setIsStreaming(false);

  // Finalize any pending messages
  updateMessages((prev) =>
    prev.map((m) => (m.pending ? { ...m, pending: false } : m)),
  );
}

function submitFeedback(messageId: string, rating: FeedbackRating): void {
  // Optimistically update UI
  updateMessages((prev) =>
    prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m)),
  );

  // Fire and forget API call
  void submitMessageFeedback(sessionId(), messageId, rating).catch(() => {
    // Revert on failure
    updateMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, feedback: undefined } : m,
      ),
    );
  });
}

function escalateToHuman(): void {
  const systemMessage: SupportMessage = {
    id: generateId("system"),
    role: "system",
    content: "Requesting transfer to a human agent...",
    timestamp: Date.now(),
  };
  updateMessages((prev) => [...prev, systemMessage]);

  void requestEscalation(sessionId())
    .then((result) => {
      setAgentMode("human");
      updateMessages((prev) => [
        ...prev,
        {
          id: generateId("system"),
          role: "system",
          content: `You have been connected to a human agent. Ticket ID: ${result.ticketId}. A support representative will respond shortly.`,
          timestamp: Date.now(),
        },
      ]);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Escalation failed";
      updateMessages((prev) => [
        ...prev,
        {
          id: generateId("system"),
          role: "system",
          content: `Unable to connect to a human agent: ${message}. Please try again later.`,
          timestamp: Date.now(),
        },
      ]);
    });
}

function clearConversation(): void {
  cancelStream();
  setMessages([]);
  setError(null);
  setAgentMode("ai");
  setUnreadCount(0);

  // Generate new session
  const newId = `support-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  setSessionId(newId);

  try {
    sessionStorage.setItem(SESSION_KEY, newId);
    sessionStorage.removeItem(MESSAGES_KEY);
  } catch {
    // Ignore storage errors
  }
}

// ── Exported Store ──────────────────────────────────────────────────

export interface SupportStore {
  messages: Accessor<SupportMessage[]>;
  isOpen: Accessor<boolean>;
  isStreaming: Accessor<boolean>;
  sessionId: Accessor<string>;
  agentMode: Accessor<SupportAgentMode>;
  error: Accessor<string | null>;
  unreadCount: Accessor<number>;
  toggleOpen: () => void;
  open: () => void;
  close: () => void;
  sendMessage: (text: string) => void;
  cancelStream: () => void;
  submitFeedback: (messageId: string, rating: FeedbackRating) => void;
  escalateToHuman: () => void;
  clearConversation: () => void;
}

export const supportStore: SupportStore = {
  messages,
  isOpen,
  isStreaming,
  sessionId,
  agentMode,
  error,
  unreadCount,
  toggleOpen,
  open,
  close,
  sendMessage,
  cancelStream,
  submitFeedback,
  escalateToHuman,
  clearConversation,
};

export function useSupport(): SupportStore {
  return supportStore;
}
