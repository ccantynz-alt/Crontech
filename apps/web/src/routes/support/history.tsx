// ── Support History Page ─────────────────────────────────────────────
// Displays past support conversations for logged-in users. Each
// conversation can be expanded to view the full transcript and
// optionally reopened.

import { Title } from "@solidjs/meta";
import {
  type JSX,
  For,
  Show,
  createSignal,
  createResource,
} from "solid-js";
import { Button, Card, Stack, Text, Badge, Spinner } from "@cronix/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { useSupport } from "../../stores/support";

// ── Types ────────────────────────────────────────────────────────────

type ConversationStatus = "resolved" | "open" | "escalated";

interface ConversationSummary {
  id: string;
  sessionId: string;
  status: ConversationStatus;
  summary: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ConversationDetail {
  id: string;
  sessionId: string;
  status: ConversationStatus;
  messages: TranscriptMessage[];
}

interface TranscriptMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// ── Status Config ───────────────────────────────────────────────────

const statusBadgeVariant: Record<ConversationStatus, "default" | "success" | "warning" | "error" | "info"> = {
  resolved: "success",
  open: "info",
  escalated: "warning",
};

const statusLabels: Record<ConversationStatus, string> = {
  resolved: "Resolved",
  open: "Open",
  escalated: "Escalated",
};

// ── Mock Data (until API is wired) ──────────────────────────────────

const MOCK_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "conv-1",
    sessionId: "sess-abc-123",
    status: "resolved",
    summary: "Billing question about upgrading from free to pro plan",
    messageCount: 8,
    createdAt: "2026-04-02T14:30:00Z",
    updatedAt: "2026-04-02T14:45:00Z",
  },
  {
    id: "conv-2",
    sessionId: "sess-def-456",
    status: "open",
    summary: "Deployment failing with edge function timeout on large builds",
    messageCount: 12,
    createdAt: "2026-04-03T09:15:00Z",
    updatedAt: "2026-04-03T10:20:00Z",
  },
  {
    id: "conv-3",
    sessionId: "sess-ghi-789",
    status: "escalated",
    summary: "Feature request for custom component import in AI builder",
    messageCount: 5,
    createdAt: "2026-04-01T16:00:00Z",
    updatedAt: "2026-04-01T16:30:00Z",
  },
];

const MOCK_TRANSCRIPT: TranscriptMessage[] = [
  { id: "t-1", role: "user", content: "I need help upgrading my plan", timestamp: 1712068200000 },
  { id: "t-2", role: "assistant", content: "I can help you with that! You are currently on the **Free** plan. Would you like to upgrade to the **Pro** plan ($29/month) or the **Enterprise** plan (custom pricing)?", timestamp: 1712068210000 },
  { id: "t-3", role: "user", content: "What is included in the Pro plan?", timestamp: 1712068230000 },
  { id: "t-4", role: "assistant", content: "The **Pro plan** includes:\n- Unlimited AI builder generations\n- Custom domains\n- Real-time collaboration (up to 5 users)\n- Priority support\n- 100GB storage\n- Advanced analytics", timestamp: 1712068240000 },
  { id: "t-5", role: "user", content: "That sounds great. How do I upgrade?", timestamp: 1712068260000 },
  { id: "t-6", role: "assistant", content: "You can upgrade by going to **Settings > Billing** in your dashboard, or I can take you there directly. Would you like me to redirect you?", timestamp: 1712068270000 },
  { id: "t-7", role: "user", content: "Yes, please redirect me", timestamp: 1712068290000 },
  { id: "t-8", role: "assistant", content: "Redirecting you to the billing page now. If you have any other questions, feel free to come back to chat anytime!", timestamp: 1712068300000 },
];

// ── Fetch Functions (placeholder) ───────────────────────────────────

async function fetchConversations(): Promise<ConversationSummary[]> {
  // TODO: Replace with actual API call
  // const response = await fetch("/api/support/history");
  // return response.json();
  await new Promise((resolve) => setTimeout(resolve, 500));
  return MOCK_CONVERSATIONS;
}

async function fetchTranscript(conversationId: string): Promise<TranscriptMessage[]> {
  // TODO: Replace with actual API call
  // const response = await fetch(`/api/support/history/${conversationId}`);
  // return response.json();
  await new Promise((resolve) => setTimeout(resolve, 300));
  return MOCK_TRANSCRIPT;
}

// ── Conversation Row ────────────────────────────────────────────────

interface ConversationRowProps {
  conversation: ConversationSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onReopen: () => void;
}

function ConversationRow(props: ConversationRowProps): JSX.Element {
  const [transcript] = createResource(
    () => (props.isExpanded ? props.conversation.id : null),
    async (id) => {
      if (!id) return null;
      return fetchTranscript(id);
    },
  );

  const formattedDate = (): string => {
    return new Date(props.conversation.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card padding="none" class="overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        class="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
        onClick={props.onToggle}
      >
        <Stack direction="vertical" gap="sm">
          <Stack direction="horizontal" gap="sm" align="center">
            <Badge variant={statusBadgeVariant[props.conversation.status]} size="sm">
              {statusLabels[props.conversation.status]}
            </Badge>
            <Text variant="caption" class="text-gray-400">
              {formattedDate()}
            </Text>
            <Text variant="caption" class="text-gray-400">
              {props.conversation.messageCount} messages
            </Text>
            <div class="flex-1" />
            <svg
              class={`w-4 h-4 text-gray-400 transition-transform ${props.isExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Stack>
          <Text variant="body" class="text-gray-900">
            {props.conversation.summary}
          </Text>
        </Stack>
      </button>

      {/* Expanded transcript */}
      <Show when={props.isExpanded}>
        <div class="border-t border-gray-200 bg-gray-50 px-5 py-4">
          <Show
            when={!transcript.loading}
            fallback={
              <div class="flex justify-center py-6">
                <Spinner size="sm" label="Loading transcript" />
              </div>
            }
          >
            <Stack direction="vertical" gap="sm">
              <Text variant="caption" weight="semibold" class="text-gray-500 uppercase tracking-wider">
                Transcript
              </Text>
              <div class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                <For each={transcript() ?? []}>
                  {(msg) => (
                    <div class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        class={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : msg.role === "system"
                              ? "bg-amber-50 text-amber-900 border border-amber-200"
                              : "bg-white text-gray-800 border border-gray-200"
                        }`}
                      >
                        <p class="whitespace-pre-wrap break-words">{msg.content}</p>
                        <div class={`text-[10px] mt-1 ${msg.role === "user" ? "text-blue-200" : "text-gray-400"}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>

              {/* Reopen button */}
              <Show when={props.conversation.status === "resolved"}>
                <div class="pt-3 border-t border-gray-200">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={props.onReopen}
                  >
                    Reopen Conversation
                  </Button>
                </div>
              </Show>
            </Stack>
          </Show>
        </div>
      </Show>
    </Card>
  );
}

// ── Support History Page ────────────────────────────────────────────

export default function SupportHistoryPage(): JSX.Element {
  const support = useSupport();
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const [conversations] = createResource(fetchConversations);

  function toggleConversation(id: string): void {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function reopenConversation(conversation: ConversationSummary): void {
    // Open the chat widget with context about the reopened conversation
    support.sendMessage(
      `I would like to follow up on a previous conversation: "${conversation.summary}"`,
    );
    support.open();
  }

  return (
    <ProtectedRoute>
      <Title>Support History - Cronix</Title>
      <Stack direction="vertical" gap="lg" class="page-padded max-w-3xl mx-auto">
        {/* Header */}
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Support History
          </Text>
          <Text variant="body" class="text-gray-500">
            View past support conversations and their status.
          </Text>
        </Stack>

        {/* Loading state */}
        <Show when={conversations.loading}>
          <div class="flex justify-center py-12">
            <Spinner size="lg" label="Loading conversations" />
          </div>
        </Show>

        {/* Empty state */}
        <Show when={!conversations.loading && (conversations() ?? []).length === 0}>
          <Card padding="lg" class="text-center">
            <Stack direction="vertical" gap="md" align="center">
              <svg class="w-16 h-16 text-gray-200" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
              <Text variant="h4" weight="semibold" class="text-gray-600">
                No conversations yet
              </Text>
              <Text variant="body" class="text-gray-400">
                When you chat with support, your conversations will appear here.
              </Text>
              <Button variant="primary" onClick={() => support.open()}>
                Start a Conversation
              </Button>
            </Stack>
          </Card>
        </Show>

        {/* Conversation list */}
        <Show when={!conversations.loading && (conversations() ?? []).length > 0}>
          <Stack direction="vertical" gap="sm">
            <For each={conversations() ?? []}>
              {(conv) => (
                <ConversationRow
                  conversation={conv}
                  isExpanded={expandedId() === conv.id}
                  onToggle={() => toggleConversation(conv.id)}
                  onReopen={() => reopenConversation(conv)}
                />
              )}
            </For>
          </Stack>
        </Show>
      </Stack>
    </ProtectedRoute>
  );
}
