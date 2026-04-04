import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";
import {
  Stack,
  Card,
  Text,
  Button,
  Badge,
  Textarea,
  Separator,
} from "@back-to-the-future/ui";

export interface ComposeEditorProps {
  value: string;
  onInput: (value: string) => void;
}

type AIAssistMode = "complete" | "improve-tone" | "generate-draft" | null;

export function ComposeEditor(props: ComposeEditorProps): JSX.Element {
  const [aiAssistMode, setAiAssistMode] = createSignal<AIAssistMode>(null);
  const [aiSuggestion, setAiSuggestion] = createSignal<string>("");
  const [isAiLoading, setIsAiLoading] = createSignal<boolean>(false);
  const [showAiPanel, setShowAiPanel] = createSignal<boolean>(false);

  const requestAiAssist = async (mode: AIAssistMode): Promise<void> => {
    if (!mode) return;
    setAiAssistMode(mode);
    setIsAiLoading(true);
    setShowAiPanel(true);

    try {
      const prompts: Record<Exclude<AIAssistMode, null>, string> = {
        complete: `Complete this email draft naturally. Continue from where the writer left off:\n\n${props.value}`,
        "improve-tone": `Improve the tone of this email to be more professional and clear. Return the full rewritten email:\n\n${props.value}`,
        "generate-draft": `Generate a professional email draft. The current context is:\n\n${props.value || "(empty - generate a general professional email template)"}`,
      };

      const response = await fetch("/api/ai/compose-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompts[mode],
          mode,
        }),
      });

      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "text" in data) {
        setAiSuggestion((data as { text: string }).text);
      }
    } catch {
      setAiSuggestion("AI assist is currently unavailable. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const acceptSuggestion = (): void => {
    props.onInput(aiSuggestion());
    setShowAiPanel(false);
    setAiSuggestion("");
    setAiAssistMode(null);
  };

  const dismissSuggestion = (): void => {
    setShowAiPanel(false);
    setAiSuggestion("");
    setAiAssistMode(null);
  };

  return (
    <Stack direction="vertical" gap="md" class="flex-1">
      {/* Toolbar */}
      <Stack direction="horizontal" gap="sm" align="center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => requestAiAssist("complete")}
          loading={isAiLoading() && aiAssistMode() === "complete"}
        >
          AI Complete
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => requestAiAssist("improve-tone")}
          loading={isAiLoading() && aiAssistMode() === "improve-tone"}
        >
          Improve Tone
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => requestAiAssist("generate-draft")}
          loading={isAiLoading() && aiAssistMode() === "generate-draft"}
        >
          Generate Draft
        </Button>
        <Separator />
        <Badge variant="info" size="sm">AI Powered</Badge>
      </Stack>

      {/* AI Suggestion Panel */}
      <Show when={showAiPanel()}>
        <Card class="bg-purple-50 border border-purple-200">
          <Stack direction="vertical" gap="sm">
            <Stack direction="horizontal" gap="sm" align="center" justify="between">
              <Badge variant="info" size="sm">
                {aiAssistMode() === "complete"
                  ? "AI Completion"
                  : aiAssistMode() === "improve-tone"
                    ? "Tone Improvement"
                    : "Generated Draft"}
              </Badge>
              <Stack direction="horizontal" gap="xs">
                <Button variant="primary" size="sm" onClick={acceptSuggestion}>
                  Accept
                </Button>
                <Button variant="ghost" size="sm" onClick={dismissSuggestion}>
                  Dismiss
                </Button>
              </Stack>
            </Stack>
            <Show
              when={!isAiLoading()}
              fallback={
                <Text variant="body" class="text-gray-500">
                  AI is generating a suggestion...
                </Text>
              }
            >
              <Text variant="body" class="whitespace-pre-wrap">
                {aiSuggestion()}
              </Text>
            </Show>
          </Stack>
        </Card>
      </Show>

      {/* Rich Text Editor Placeholder */}
      <Textarea
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder="Write your email here... Use AI assist buttons above for help."
        class="flex-1 min-h-64 resize-none font-sans text-base leading-relaxed"
      />
    </Stack>
  );
}
