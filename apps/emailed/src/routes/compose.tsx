import { Title } from "@solidjs/meta";
import { createSignal } from "solid-js";
import { A } from "@solidjs/router";
import {
  Stack,
  Card,
  Text,
  Button,
  Input,
  Separator,
} from "@back-to-the-future/ui";
import { ComposeEditor } from "~/components/ComposeEditor";

export default function ComposePage(): ReturnType<typeof Stack> {
  const [to, setTo] = createSignal<string>("");
  const [cc, setCc] = createSignal<string>("");
  const [bcc, setBcc] = createSignal<string>("");
  const [subject, setSubject] = createSignal<string>("");
  const [body, setBody] = createSignal<string>("");
  const [showCcBcc, setShowCcBcc] = createSignal<boolean>(false);
  const [isSending, setIsSending] = createSignal<boolean>(false);

  const handleSend = async (): Promise<void> => {
    setIsSending(true);
    try {
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to(),
          cc: cc(),
          bcc: bcc(),
          subject: subject(),
          body: body(),
        }),
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async (): Promise<void> => {
    await fetch("/api/email/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: to(),
        cc: cc(),
        bcc: bcc(),
        subject: subject(),
        body: body(),
      }),
    });
  };

  return (
    <Stack direction="vertical" gap="none" class="h-screen w-screen">
      <Title>Emailed — Compose</Title>

      {/* Header */}
      <Stack
        direction="horizontal"
        gap="md"
        align="center"
        justify="between"
        class="p-4 border-b border-gray-200"
      >
        <Stack direction="horizontal" gap="md" align="center">
          <A href="/">
            <Button variant="ghost" size="sm">Back</Button>
          </A>
          <Text variant="h3" weight="semibold">New Message</Text>
        </Stack>
        <Stack direction="horizontal" gap="sm">
          <Button variant="outline" size="md" onClick={handleSaveDraft}>
            Save Draft
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={isSending()}
            onClick={handleSend}
          >
            Send
          </Button>
        </Stack>
      </Stack>

      {/* Compose Form */}
      <Stack direction="vertical" gap="none" class="flex-1 overflow-y-auto">
        <Card padding="none" class="m-4 flex-1">
          <Stack direction="vertical" gap="none" class="h-full">
            {/* Recipients */}
            <Stack direction="vertical" gap="none" class="px-4">
              <Stack direction="horizontal" gap="sm" align="center" class="py-2">
                <Text variant="body" class="w-12 shrink-0 text-gray-500">To:</Text>
                <Input
                  value={to()}
                  onInput={(e) => setTo(e.currentTarget.value)}
                  placeholder="recipients@example.com"
                  class="flex-1 border-none"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCcBcc(!showCcBcc())}
                >
                  {showCcBcc() ? "Hide" : "CC/BCC"}
                </Button>
              </Stack>

              <Separator />

              {showCcBcc() && (
                <>
                  <Stack direction="horizontal" gap="sm" align="center" class="py-2">
                    <Text variant="body" class="w-12 shrink-0 text-gray-500">CC:</Text>
                    <Input
                      value={cc()}
                      onInput={(e) => setCc(e.currentTarget.value)}
                      placeholder="cc@example.com"
                      class="flex-1 border-none"
                    />
                  </Stack>
                  <Separator />
                  <Stack direction="horizontal" gap="sm" align="center" class="py-2">
                    <Text variant="body" class="w-12 shrink-0 text-gray-500">BCC:</Text>
                    <Input
                      value={bcc()}
                      onInput={(e) => setBcc(e.currentTarget.value)}
                      placeholder="bcc@example.com"
                      class="flex-1 border-none"
                    />
                  </Stack>
                  <Separator />
                </>
              )}

              <Stack direction="horizontal" gap="sm" align="center" class="py-2">
                <Text variant="body" class="w-12 shrink-0 text-gray-500">Subj:</Text>
                <Input
                  value={subject()}
                  onInput={(e) => setSubject(e.currentTarget.value)}
                  placeholder="Subject"
                  class="flex-1 border-none"
                />
              </Stack>

              <Separator />
            </Stack>

            {/* Editor */}
            <Stack direction="vertical" gap="none" class="flex-1 p-4">
              <ComposeEditor
                value={body()}
                onInput={setBody}
              />
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Stack>
  );
}
