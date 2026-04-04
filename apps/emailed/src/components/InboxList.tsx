import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import {
  Stack,
  Card,
  Text,
  Badge,
  Avatar,
  Separator,
} from "@back-to-the-future/ui";
import type { Email } from "~/lib/email-types";

export interface InboxListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onSelectEmail: (email: Email) => void;
}

/** Format a datetime string into a human-friendly time display */
function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `${mins}m ago`;
  }
  if (diffHours < 24) {
    return `${Math.floor(diffHours)}h ago`;
  }
  if (diffHours < 24 * 7) {
    return `${Math.floor(diffHours / 24)}d ago`;
  }
  return date.toLocaleDateString();
}

/** Map AI classification categories to Badge variants */
function classificationVariant(
  category: string,
): "default" | "success" | "warning" | "error" | "info" {
  const map: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
    important: "error",
    newsletter: "info",
    social: "success",
    promotions: "warning",
    spam: "error",
    updates: "default",
    finance: "warning",
    travel: "info",
  };
  return map[category] ?? "default";
}

export function InboxList(props: InboxListProps): JSX.Element {
  return (
    <Stack direction="vertical" gap="none">
      <Show
        when={props.emails.length > 0}
        fallback={
          <Stack direction="vertical" align="center" justify="center" class="p-8">
            <Text variant="body" class="text-gray-400">
              No emails in this folder
            </Text>
          </Stack>
        }
      >
        <For each={props.emails}>
          {(email) => (
            <Stack
              direction="vertical"
              gap="none"
              class={`cursor-pointer border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 ${
                props.selectedEmailId === email.id ? "bg-blue-50" : ""
              } ${!email.isRead ? "bg-white" : "bg-gray-25"}`}
              onClick={() => props.onSelectEmail(email)}
            >
              <Stack direction="horizontal" gap="sm" align="start">
                {/* Sender Avatar */}
                <Avatar
                  class="shrink-0 mt-0.5"
                />

                {/* Email Content */}
                <Stack direction="vertical" gap="xs" class="flex-1 min-w-0">
                  {/* Top row: sender + time */}
                  <Stack direction="horizontal" gap="sm" align="center" justify="between">
                    <Text
                      variant="body"
                      weight={email.isRead ? "normal" : "bold"}
                      class="truncate"
                    >
                      {email.from.name}
                    </Text>
                    <Text variant="caption" class="shrink-0 text-gray-400">
                      {formatTime(email.sentAt)}
                    </Text>
                  </Stack>

                  {/* Subject */}
                  <Text
                    variant="body"
                    weight={email.isRead ? "normal" : "semibold"}
                    class="truncate"
                  >
                    {email.subject}
                  </Text>

                  {/* Snippet */}
                  <Text variant="caption" class="truncate text-gray-500">
                    {email.bodyText.slice(0, 100)}
                  </Text>

                  {/* Badges row: AI classification + labels */}
                  <Stack direction="horizontal" gap="xs" align="center" class="mt-1">
                    {/* Unread indicator */}
                    <Show when={!email.isRead}>
                      <Badge variant="info" size="sm">New</Badge>
                    </Show>

                    {/* AI Classification badge */}
                    <Show when={email.classification !== undefined}>
                      <Badge
                        variant={classificationVariant(email.classification!.category)}
                        size="sm"
                      >
                        {email.classification!.category}
                      </Badge>
                    </Show>

                    {/* Star indicator */}
                    <Show when={email.isStarred}>
                      <Badge variant="warning" size="sm">Starred</Badge>
                    </Show>

                    {/* Attachment indicator */}
                    <Show when={email.attachments.length > 0}>
                      <Badge variant="default" size="sm">
                        {email.attachments.length} file{email.attachments.length > 1 ? "s" : ""}
                      </Badge>
                    </Show>
                  </Stack>
                </Stack>
              </Stack>
            </Stack>
          )}
        </For>
      </Show>
    </Stack>
  );
}
