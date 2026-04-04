import type { JSX } from "solid-js";
import { createSignal, createResource, For, Show } from "solid-js";
import {
  Stack,
  Card,
  Text,
  Button,
  Badge,
  Avatar,
  Separator,
} from "@back-to-the-future/ui";
import type { Email, Thread } from "~/lib/email-types";
import { summarizeThread, suggestReply } from "~/lib/ai-features";

export interface EmailViewProps {
  thread: Thread;
  email: Email;
}

export function EmailView(props: EmailViewProps): JSX.Element {
  const [showSummary, setShowSummary] = createSignal<boolean>(false);
  const [showReplySuggestions, setShowReplySuggestions] = createSignal<boolean>(false);

  const [summary] = createResource(
    () => (showSummary() ? props.thread : null),
    async (thread) => {
      if (!thread) return null;
      return summarizeThread(thread);
    },
  );

  const [replySuggestions] = createResource(
    () => (showReplySuggestions() ? props.thread : null),
    async (thread) => {
      if (!thread) return null;
      return suggestReply(thread);
    },
  );

  return (
    <Stack direction="vertical" gap="none" class="h-full">
      {/* Email Header */}
      <Stack direction="vertical" gap="md" class="p-6 border-b border-gray-200">
        {/* Subject */}
        <Text variant="h2" weight="bold">{props.email.subject}</Text>

        {/* AI Actions Bar */}
        <Stack direction="horizontal" gap="sm" align="center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSummary(!showSummary())}
          >
            {showSummary() ? "Hide Summary" : "AI Summary"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReplySuggestions(!showReplySuggestions())}
          >
            {showReplySuggestions() ? "Hide Suggestions" : "AI Reply Suggestions"}
          </Button>
          <Show when={props.email.classification !== undefined}>
            <Badge
              variant={
                props.email.classification!.priority === "high"
                  ? "error"
                  : props.email.classification!.priority === "medium"
                    ? "warning"
                    : "default"
              }
              size="sm"
            >
              {props.email.classification!.priority} priority
            </Badge>
            <Badge variant="info" size="sm">
              {props.email.classification!.category}
            </Badge>
          </Show>
        </Stack>

        {/* AI Summary Card */}
        <Show when={showSummary()}>
          <Card class="bg-blue-50 border border-blue-200">
            <Stack direction="vertical" gap="sm">
              <Stack direction="horizontal" gap="xs" align="center">
                <Badge variant="info" size="sm">AI Summary</Badge>
                <Text variant="caption" class="text-gray-500">
                  {props.thread.messageCount} messages in thread
                </Text>
              </Stack>
              <Show
                when={!summary.loading}
                fallback={<Text variant="body" class="text-gray-500">Generating summary...</Text>}
              >
                <Text variant="body">{summary() ?? "Unable to generate summary."}</Text>
              </Show>
            </Stack>
          </Card>
        </Show>

        {/* AI Reply Suggestions */}
        <Show when={showReplySuggestions()}>
          <Card class="bg-green-50 border border-green-200">
            <Stack direction="vertical" gap="sm">
              <Badge variant="success" size="sm">AI Reply Suggestions</Badge>
              <Show
                when={!replySuggestions.loading}
                fallback={
                  <Text variant="body" class="text-gray-500">
                    Generating reply suggestions...
                  </Text>
                }
              >
                <For each={replySuggestions() ?? []}>
                  {(suggestion, index) => (
                    <Button variant="outline" size="sm" class="text-left justify-start">
                      <Text variant="body" class="truncate">
                        {suggestion}
                      </Text>
                    </Button>
                  )}
                </For>
              </Show>
            </Stack>
          </Card>
        </Show>
      </Stack>

      {/* Thread View */}
      <Stack direction="vertical" gap="none" class="flex-1 overflow-y-auto">
        <For each={props.thread.emails}>
          {(email) => (
            <Stack direction="vertical" gap="md" class="p-6 border-b border-gray-100">
              {/* Message Header */}
              <Stack direction="horizontal" gap="sm" align="start">
                <Avatar class="shrink-0" />
                <Stack direction="vertical" gap="xs" class="flex-1">
                  <Stack direction="horizontal" gap="sm" align="center" justify="between">
                    <Stack direction="horizontal" gap="xs" align="center">
                      <Text variant="body" weight="bold">{email.from.name}</Text>
                      <Text variant="caption" class="text-gray-400">
                        {email.from.email}
                      </Text>
                    </Stack>
                    <Text variant="caption" class="text-gray-400">
                      {new Date(email.sentAt).toLocaleString()}
                    </Text>
                  </Stack>
                  <Text variant="caption" class="text-gray-500">
                    To: {email.to.map((c) => c.name || c.email).join(", ")}
                    <Show when={email.cc.length > 0}>
                      {" "}| CC: {email.cc.map((c) => c.name || c.email).join(", ")}
                    </Show>
                  </Text>
                </Stack>
              </Stack>

              {/* Message Body */}
              <Stack direction="vertical" gap="sm" class="pl-12">
                <Text variant="body" class="whitespace-pre-wrap leading-relaxed">
                  {email.bodyText}
                </Text>

                {/* Attachments */}
                <Show when={email.attachments.length > 0}>
                  <Separator />
                  <Stack direction="horizontal" gap="sm" align="center">
                    <Text variant="caption" class="text-gray-500">Attachments:</Text>
                    <For each={email.attachments}>
                      {(attachment) => (
                        <Badge variant="default" size="sm">
                          {attachment.filename}
                        </Badge>
                      )}
                    </For>
                  </Stack>
                </Show>
              </Stack>
            </Stack>
          )}
        </For>
      </Stack>

      {/* Quick Reply Bar */}
      <Stack
        direction="horizontal"
        gap="sm"
        align="center"
        class="p-4 border-t border-gray-200 bg-gray-50"
      >
        <Button variant="primary" size="md">Reply</Button>
        <Button variant="outline" size="md">Reply All</Button>
        <Button variant="outline" size="md">Forward</Button>
        <Button variant="ghost" size="md">Archive</Button>
        <Button variant="destructive" size="md">Delete</Button>
      </Stack>
    </Stack>
  );
}
