// ── Message Bubble Components ────────────────────────────────────────
// Renders user, AI, and system messages with markdown support,
// tool call indicators, feedback buttons, and copy functionality.

import { type JSX, For, Show, createSignal, createMemo } from "solid-js";
import { Badge } from "@cronix/ui";
import type { SupportMessage, FeedbackRating } from "../../stores/support";

// ── Tool Call Label Map ─────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  lookup_account: "Looking up your account...",
  check_billing: "Checking billing details...",
  search_knowledge_base: "Searching knowledge base...",
  create_ticket: "Creating support ticket...",
  check_status: "Checking system status...",
  fetch_logs: "Fetching relevant logs...",
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Running ${toolName}...`;
}

// ── Simple Markdown Renderer ────────────────────────────────────────
// Handles code blocks, inline code, bold, italic, links, and lists.

function renderMarkdown(content: string): JSX.Element {
  const parts: JSX.Element[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = codeLines.join("\n");
      parts.push(<CodeBlock code={code} language={lang} />);
      continue;
    }

    // Unordered list items
    if (/^\s*[-*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s/, ""));
        i++;
      }
      parts.push(
        <ul class="list-disc list-inside space-y-0.5 my-1">
          <For each={listItems}>
            {(item) => <li class="text-sm">{renderInline(item)}</li>}
          </For>
        </ul>,
      );
      continue;
    }

    // Ordered list items
    if (/^\s*\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s/, ""));
        i++;
      }
      parts.push(
        <ol class="list-decimal list-inside space-y-0.5 my-1">
          <For each={listItems}>
            {(item) => <li class="text-sm">{renderInline(item)}</li>}
          </For>
        </ol>,
      );
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      parts.push(<p class="text-sm whitespace-pre-wrap break-words">{renderInline(line)}</p>);
    } else {
      parts.push(<div class="h-2" />);
    }
    i++;
  }

  return <>{parts}</>;
}

function renderInline(text: string): JSX.Element {
  // Process inline markdown: bold, italic, inline code, links
  const segments: JSX.Element[] = [];
  // Regex matches: inline code, bold, italic, links
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      segments.push(<>{text.slice(lastIndex, match.index)}</>);
    }

    const full = match[0];
    if (match[1]) {
      // Inline code
      segments.push(
        <code class="px-1 py-0.5 bg-gray-200 rounded text-xs font-mono">
          {full.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      // Bold
      segments.push(<strong class="font-semibold">{full.slice(2, -2)}</strong>);
    } else if (match[3]) {
      // Italic
      segments.push(<em class="italic">{full.slice(1, -1)}</em>);
    } else if (match[4]) {
      // Link
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(full);
      if (linkMatch) {
        segments.push(
          <a
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 underline hover:text-blue-800"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    }
    lastIndex = match.index + full.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push(<>{text.slice(lastIndex)}</>);
  }

  return <>{segments}</>;
}

// ── Code Block Component ────────────────────────────────────────────

interface CodeBlockProps {
  code: string;
  language: string;
}

function CodeBlock(props: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = createSignal(false);

  function copyCode(): void {
    void navigator.clipboard.writeText(props.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div class="my-2 rounded-lg overflow-hidden border border-gray-200">
      <div class="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
        <span class="text-[11px] font-mono text-gray-500">
          {props.language || "code"}
        </span>
        <button
          type="button"
          class="text-[11px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
          onClick={copyCode}
          aria-label="Copy code"
        >
          {copied() ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre class="px-3 py-2 overflow-x-auto bg-gray-50 text-xs font-mono leading-relaxed">
        <code>{props.code}</code>
      </pre>
    </div>
  );
}

// ── Typing Indicator ────────────────────────────────────────────────

export function TypingIndicator(): JSX.Element {
  return (
    <div class="flex justify-start">
      <div class="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
        <div class="flex items-center gap-1.5">
          <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ "animation-delay": "0ms" }} />
          <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ "animation-delay": "150ms" }} />
          <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ "animation-delay": "300ms" }} />
        </div>
      </div>
    </div>
  );
}

// ── Tool Call Indicator ─────────────────────────────────────────────

interface ToolCallIndicatorProps {
  toolName: string;
  result?: string;
}

function ToolCallIndicator(props: ToolCallIndicatorProps): JSX.Element {
  const isComplete = createMemo(() => props.result !== undefined);

  return (
    <div class="flex items-center gap-2 px-3 py-1.5 my-1 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
      <Show
        when={isComplete()}
        fallback={
          <svg class="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        }
      >
        <svg class="w-3.5 h-3.5 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Show>
      <span>{isComplete() ? `Completed: ${props.toolName}` : getToolLabel(props.toolName)}</span>
    </div>
  );
}

// ── Feedback Buttons ────────────────────────────────────────────────

interface FeedbackButtonsProps {
  messageId: string;
  currentFeedback?: FeedbackRating;
  onFeedback: (messageId: string, rating: FeedbackRating) => void;
}

function FeedbackButtons(props: FeedbackButtonsProps): JSX.Element {
  return (
    <div class="flex items-center gap-1 mt-1.5">
      <button
        type="button"
        class={`p-1 rounded transition-colors ${
          props.currentFeedback === "up"
            ? "text-green-600 bg-green-50"
            : "text-gray-400 hover:text-green-600 hover:bg-green-50"
        }`}
        onClick={() => props.onFeedback(props.messageId, "up")}
        aria-label="Helpful"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 20h2V8H2v12zm20-11a2 2 0 00-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 7.58 5.59C7.22 5.95 7 6.45 7 7v11a2 2 0 002 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9z" />
        </svg>
      </button>
      <button
        type="button"
        class={`p-1 rounded transition-colors ${
          props.currentFeedback === "down"
            ? "text-red-600 bg-red-50"
            : "text-gray-400 hover:text-red-600 hover:bg-red-50"
        }`}
        onClick={() => props.onFeedback(props.messageId, "down")}
        aria-label="Not helpful"
      >
        <svg class="w-3.5 h-3.5 rotate-180" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 20h2V8H2v12zm20-11a2 2 0 00-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 7.58 5.59C7.22 5.95 7 6.45 7 7v11a2 2 0 002 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9z" />
        </svg>
      </button>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────

export interface MessageBubbleProps {
  message: SupportMessage;
  onFeedback: (messageId: string, rating: FeedbackRating) => void;
}

export function MessageBubble(props: MessageBubbleProps): JSX.Element {
  const isUser = createMemo(() => props.message.role === "user");
  const isSystem = createMemo(() => props.message.role === "system");
  const isAssistant = createMemo(() => props.message.role === "assistant");

  return (
    <div class={`flex ${isUser() ? "justify-end" : "justify-start"}`}>
      <div
        class={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser()
            ? "bg-blue-600 text-white rounded-br-md"
            : isSystem()
              ? "bg-amber-50 text-amber-900 border border-amber-200 rounded-bl-md"
              : "bg-gray-100 text-gray-900 rounded-bl-md"
        } ${props.message.pending ? "opacity-80" : ""}`}
      >
        {/* System label */}
        <Show when={isSystem()}>
          <div class="flex items-center gap-1.5 mb-1">
            <svg class="w-3 h-3 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <span class="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">System</span>
          </div>
        </Show>

        {/* Tool call indicators */}
        <Show when={isAssistant() && props.message.toolCalls?.length}>
          <div class="mb-2 space-y-1">
            <For each={props.message.toolCalls}>
              {(tc) => <ToolCallIndicator toolName={tc.toolName} result={tc.result} />}
            </For>
          </div>
        </Show>

        {/* Message content */}
        <Show when={props.message.content}>
          <Show when={isUser()} fallback={renderMarkdown(props.message.content)}>
            <p class="text-sm whitespace-pre-wrap break-words">{props.message.content}</p>
          </Show>
        </Show>

        {/* Streaming dots for pending assistant messages with no content */}
        <Show when={props.message.pending && isAssistant() && !props.message.content}>
          <div class="flex items-center gap-1.5 py-1">
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ "animation-delay": "0ms" }} />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ "animation-delay": "150ms" }} />
            <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ "animation-delay": "300ms" }} />
          </div>
        </Show>

        {/* Feedback buttons for completed assistant messages */}
        <Show when={isAssistant() && !props.message.pending && props.message.content}>
          <FeedbackButtons
            messageId={props.message.id}
            currentFeedback={props.message.feedback}
            onFeedback={props.onFeedback}
          />
        </Show>

        {/* Timestamp */}
        <div class={`text-[10px] mt-1 ${isUser() ? "text-blue-200" : "text-gray-400"}`}>
          {new Date(props.message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
