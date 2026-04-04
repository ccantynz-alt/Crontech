import { Title } from "@solidjs/meta";
import { createSignal, createResource, For, Show } from "solid-js";
import {
  Stack,
  Card,
  Text,
  Button,
  Badge,
  Input,
  Separator,
} from "@back-to-the-future/ui";
import { InboxList } from "~/components/InboxList";
import { EmailView } from "~/components/EmailView";
import type { Email, Folder, Thread } from "~/lib/email-types";
import { smartSearch } from "~/lib/ai-features";

/** Default system folders for the sidebar */
const DEFAULT_FOLDERS: Folder[] = [
  { id: "f-inbox", name: "Inbox", slug: "inbox", icon: "inbox", unreadCount: 12, totalCount: 248, isSystem: true, isAISorted: false },
  { id: "f-sent", name: "Sent", slug: "sent", icon: "send", unreadCount: 0, totalCount: 142, isSystem: true, isAISorted: false },
  { id: "f-drafts", name: "Drafts", slug: "drafts", icon: "edit", unreadCount: 0, totalCount: 3, isSystem: true, isAISorted: false },
  { id: "f-trash", name: "Trash", slug: "trash", icon: "trash", unreadCount: 0, totalCount: 18, isSystem: true, isAISorted: false },
  { id: "f-ai-sorted", name: "AI Sorted", slug: "ai-sorted", icon: "sparkles", unreadCount: 5, totalCount: 67, isSystem: false, isAISorted: true },
  { id: "f-important", name: "Important", slug: "important", icon: "star", unreadCount: 3, totalCount: 31, isSystem: false, isAISorted: true },
  { id: "f-newsletters", name: "Newsletters", slug: "newsletters", icon: "newspaper", unreadCount: 8, totalCount: 94, isSystem: false, isAISorted: true },
  { id: "f-promotions", name: "Promotions", slug: "promotions", icon: "tag", unreadCount: 4, totalCount: 56, isSystem: false, isAISorted: true },
];

export default function InboxPage(): ReturnType<typeof Stack> {
  const [activeFolder, setActiveFolder] = createSignal<string>("inbox");
  const [selectedEmail, setSelectedEmail] = createSignal<Email | null>(null);
  const [searchQuery, setSearchQuery] = createSignal<string>("");
  const [emails, setEmails] = createSignal<Email[]>([]);
  const [selectedThread, setSelectedThread] = createSignal<Thread | null>(null);

  const filteredEmails = (): Email[] => {
    const query = searchQuery();
    if (!query) return emails();
    const lower = query.toLowerCase();
    return emails().filter(
      (e) =>
        e.subject.toLowerCase().includes(lower) ||
        e.from.name.toLowerCase().includes(lower) ||
        e.bodyText.toLowerCase().includes(lower),
    );
  };

  const handleSelectEmail = (email: Email): void => {
    setSelectedEmail(email);
    const thread: Thread = {
      id: email.threadId,
      subject: email.subject,
      emails: [email],
      participants: [email.from, ...email.to],
      lastActivityAt: email.sentAt,
      isUnread: !email.isRead,
      snippet: email.bodyText.slice(0, 120),
      messageCount: 1,
      labels: email.labels,
    };
    setSelectedThread(thread);
  };

  return (
    <Stack direction="horizontal" gap="none" class="h-screen w-screen overflow-hidden">
      <Title>Emailed — Inbox</Title>

      {/* Sidebar */}
      <Stack
        direction="vertical"
        gap="none"
        class="w-64 shrink-0 border-r border-gray-200 bg-gray-50 h-full"
      >
        <Stack direction="vertical" gap="sm" class="p-4">
          <Text variant="h3" weight="bold">Emailed</Text>
          <Button variant="primary" size="md" class="w-full">
            Compose
          </Button>
        </Stack>

        <Separator />

        <Stack direction="vertical" gap="none" class="flex-1 overflow-y-auto py-2">
          <For each={DEFAULT_FOLDERS}>
            {(folder) => (
              <Button
                variant={activeFolder() === folder.slug ? "secondary" : "ghost"}
                size="md"
                class="w-full justify-between rounded-none px-4"
                onClick={() => setActiveFolder(folder.slug)}
              >
                <Stack direction="horizontal" gap="sm" align="center">
                  <Show when={folder.isAISorted}>
                    <Badge variant="info" size="sm">AI</Badge>
                  </Show>
                  <Text variant="body">{folder.name}</Text>
                </Stack>
                <Show when={folder.unreadCount > 0}>
                  <Badge variant="default" size="sm">
                    {folder.unreadCount}
                  </Badge>
                </Show>
              </Button>
            )}
          </For>
        </Stack>
      </Stack>

      {/* Email List */}
      <Stack
        direction="vertical"
        gap="none"
        class="w-96 shrink-0 border-r border-gray-200 h-full"
      >
        <Stack direction="vertical" gap="sm" class="p-3 border-b border-gray-200">
          <Input
            placeholder="Search emails..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full"
          />
        </Stack>

        <Stack direction="vertical" gap="none" class="flex-1 overflow-y-auto">
          <InboxList
            emails={filteredEmails()}
            selectedEmailId={selectedEmail()?.id ?? null}
            onSelectEmail={handleSelectEmail}
          />
        </Stack>
      </Stack>

      {/* Email Preview Pane */}
      <Stack direction="vertical" gap="none" class="flex-1 h-full overflow-y-auto">
        <Show
          when={selectedEmail() !== null && selectedThread() !== null}
          fallback={
            <Stack
              direction="vertical"
              align="center"
              justify="center"
              class="flex-1 h-full"
            >
              <Text variant="body" class="text-gray-400">
                Select an email to view
              </Text>
            </Stack>
          }
        >
          <EmailView
            thread={selectedThread()!}
            email={selectedEmail()!}
          />
        </Show>
      </Stack>
    </Stack>
  );
}
