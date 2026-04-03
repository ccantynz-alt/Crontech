import { Title } from "@solidjs/meta";
import { For, Show, createSignal, onCleanup } from "solid-js";
import { Button, Card, Input, Stack, Text, Spinner, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { GenerativeUI } from "~/lib/generative-ui";
import type { Component } from "@back-to-the-future/schemas";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface BuilderEvent {
  type: "status" | "component" | "layout" | "text" | "error" | "complete";
  phase?: string;
  message?: string;
  component?: Component;
  components?: Component[];
}

type ViewportMode = "desktop" | "tablet" | "mobile";

// ── Constants ────────────────────────────────────────────────────────

const API_BASE = "/api/ai";

const VIEWPORT_CLASSES: Record<ViewportMode, string> = {
  desktop: "w-full",
  tablet: "max-w-[768px] mx-auto",
  mobile: "max-w-[375px] mx-auto",
};

// ── Chat Message Component ───────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): ReturnType<typeof Stack> {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div
      class={`p-3 rounded-lg mb-2 ${
        isUser()
          ? "bg-blue-600 text-white ml-8"
          : "bg-gray-100 text-gray-900 mr-8"
      }`}
    >
      <Text variant="caption" weight="semibold">
        {isUser() ? "You" : "AI Builder"}
      </Text>
      <Text variant="body">{props.message.content}</Text>
    </div>
  );
}

// ── Preview Panel ────────────────────────────────────────────────────

function PreviewPanel(props: {
  components: Component[];
  viewport: ViewportMode;
}): ReturnType<typeof Card> {
  return (
    <div class={`${VIEWPORT_CLASSES[props.viewport]} transition-all duration-300`}>
      <Show
        when={props.components.length > 0}
        fallback={
          <Stack direction="vertical" align="center" justify="center" class="min-h-[400px]">
            <Text variant="h3" class="text-gray-400">
              Preview Area
            </Text>
            <Text variant="body" class="text-gray-400">
              Describe your website in the chat and the AI will build it here.
            </Text>
          </Stack>
        }
      >
        <Stack direction="vertical" gap="md" class="p-4">
          <For each={props.components}>
            {(component) => <GenerativeUI config={component} />}
          </For>
        </Stack>
      </Show>
    </div>
  );
}

// ── Build Status Badge ───────────────────────────────────────────────

function BuildPhaseIndicator(props: { phase: string }): ReturnType<typeof Badge> {
  const variantMap: Record<string, "default" | "info" | "success" | "warning"> = {
    analyzing: "info",
    planning: "info",
    generating: "warning",
    assembling: "warning",
    refining: "default",
    complete: "success",
  };

  const variant = (): "default" | "info" | "success" | "warning" =>
    variantMap[props.phase] ?? "default";

  return <Badge variant={variant()}>{props.phase}</Badge>;
}

// ── SSE Event Source Helper ──────────────────────────────────────────

function connectBuildSSE(
  userMessage: string,
  onEvent: (event: BuilderEvent) => void,
  onDone: () => void,
  onError: (message: string) => void,
): AbortController {
  const controller = new AbortController();

  const run = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userMessage }],
          mode: "generate",
          computeTier: "cloud",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        onError(`Build request failed: ${response.status} ${errorBody}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentData.length > 0) {
            // Empty line signals end of event
            try {
              const event = JSON.parse(currentData) as BuilderEvent;
              onEvent(event);
            } catch {
              // Skip malformed events
            }
            currentData = "";
          }
        }
      }

      onDone();
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Connection failed";
      onError(message);
    }
  };

  void run();
  return controller;
}

// ── Refine Helper ────────────────────────────────────────────────────

async function refineComponents(
  currentComponents: Component[],
  message: string,
): Promise<{ components: Component[]; description: string } | { error: string }> {
  try {
    const response = await fetch(`${API_BASE}/build/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        components: currentComponents,
        message,
        computeTier: "cloud",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { error: `Refine failed: ${response.status} ${errorBody}` };
    }

    const result = (await response.json()) as {
      success: boolean;
      components: Component[];
      description: string;
      error?: string;
    };

    if (!result.success) {
      return { error: result.error ?? "Refinement failed" };
    }

    return { components: result.components, description: result.description };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { error: message };
  }
}

// ── Builder Page ─────────────────────────────────────────────────────

export default function BuilderPage(): ReturnType<typeof ProtectedRoute> {
  const [messages, setMessages] = createSignal<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to the AI Website Builder. Describe the website you want to create, and I will build it for you in real time. You can ask for changes, add sections, or adjust styling at any point.",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [components, setComponents] = createSignal<Component[]>([]);
  const [buildPhase, setBuildPhase] = createSignal<string>("");
  const [viewport, setViewport] = createSignal<ViewportMode>("desktop");

  let activeController: AbortController | undefined;

  // Cleanup on unmount
  onCleanup(() => {
    activeController?.abort();
  });

  const addMessage = (role: "user" | "assistant", content: string): void => {
    const msg: ChatMessage = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  };

  const handleSend = (): void => {
    const text = inputText().trim();
    if (text.length === 0 || isGenerating()) return;

    addMessage("user", text);
    setInputText("");
    setIsGenerating(true);
    setBuildPhase("analyzing");

    const hasExistingComponents = components().length > 0;

    if (hasExistingComponents) {
      // Refine existing build
      const currentComps = components();
      void (async () => {
        setBuildPhase("refining");
        const result = await refineComponents(currentComps, text);

        if ("error" in result) {
          addMessage("assistant", `Error: ${result.error}`);
        } else {
          setComponents(result.components);
          addMessage(
            "assistant",
            `Updated the page: ${result.description}. The preview has been refreshed with ${result.components.length} components.`,
          );
        }

        setBuildPhase("");
        setIsGenerating(false);
      })();
      return;
    }

    // New build via SSE
    const collectedComponents: Component[] = [];

    activeController = connectBuildSSE(
      text,
      (event: BuilderEvent) => {
        switch (event.type) {
          case "status": {
            if (event.phase !== undefined) {
              setBuildPhase(event.phase);
            }
            if (event.message !== undefined) {
              addMessage("assistant", event.message);
            }
            break;
          }
          case "component": {
            if (event.component !== undefined) {
              collectedComponents.push(event.component);
              setComponents([...collectedComponents]);
            }
            break;
          }
          case "complete": {
            if (event.components !== undefined) {
              setComponents(event.components);
            }
            break;
          }
          case "error": {
            addMessage("assistant", `Error: ${event.message ?? "Unknown error"}`);
            break;
          }
          case "text": {
            if (event.message !== undefined) {
              addMessage("assistant", event.message);
            }
            break;
          }
        }
      },
      () => {
        setBuildPhase("");
        setIsGenerating(false);
        activeController = undefined;
        if (collectedComponents.length > 0) {
          addMessage(
            "assistant",
            `Build complete. Generated ${collectedComponents.length} components. You can now ask me to refine, add sections, or change styles.`,
          );
        }
      },
      (errorMsg: string) => {
        addMessage("assistant", `Connection error: ${errorMsg}`);
        setBuildPhase("");
        setIsGenerating(false);
        activeController = undefined;
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = (): void => {
    activeController?.abort();
    activeController = undefined;
    setComponents([]);
    setBuildPhase("");
    setIsGenerating(false);
    setMessages([
      {
        id: "welcome-reset",
        role: "assistant",
        content: "Canvas cleared. Describe a new website to get started.",
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <ProtectedRoute>
      <Title>AI Builder - Back to the Future</Title>
      <div class="flex h-screen overflow-hidden">
        {/* Chat Panel */}
        <div class="w-[400px] shrink-0 flex flex-col border-r border-gray-200 bg-white">
          {/* Header */}
          <div class="p-4 border-b border-gray-200">
            <Stack direction="horizontal" justify="between" align="center">
              <Text variant="h3" weight="bold">
                AI Website Builder
              </Text>
              <Show when={buildPhase().length > 0}>
                <Stack direction="horizontal" gap="xs" align="center">
                  <Spinner size="sm" />
                  <BuildPhaseIndicator phase={buildPhase()} />
                </Stack>
              </Show>
            </Stack>
          </div>

          {/* Messages */}
          <div class="flex-1 overflow-y-auto p-4">
            <For each={messages()}>
              {(msg) => <ChatBubble message={msg} />}
            </For>
            <Show when={isGenerating() && buildPhase().length > 0}>
              <div class="p-3 rounded-lg mb-2 bg-gray-100 mr-8">
                <Stack direction="horizontal" gap="sm" align="center">
                  <Spinner size="sm" />
                  <Text variant="body" class="text-gray-500">
                    {buildPhase() === "analyzing" && "Analyzing your request..."}
                    {buildPhase() === "planning" && "Planning the layout..."}
                    {buildPhase() === "generating" && "Generating components..."}
                    {buildPhase() === "assembling" && "Assembling the page..."}
                    {buildPhase() === "refining" && "Refining the design..."}
                  </Text>
                </Stack>
              </div>
            </Show>
          </div>

          {/* Input */}
          <div class="p-4 border-t border-gray-200">
            <Stack direction="horizontal" gap="sm" align="end">
              <div class="flex-1">
                <Input
                  placeholder="Describe your website..."
                  value={inputText()}
                  onInput={(e) => setInputText(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isGenerating()}
                  name="builder-input"
                />
              </div>
              <Button
                variant="primary"
                onClick={handleSend}
                loading={isGenerating()}
                disabled={inputText().trim().length === 0}
              >
                Send
              </Button>
            </Stack>
          </div>
        </div>

        {/* Preview Panel */}
        <div class="flex-1 flex flex-col bg-gray-50 overflow-hidden">
          {/* Preview Toolbar */}
          <div class="p-3 border-b border-gray-200 bg-white">
            <Stack direction="horizontal" justify="between" align="center">
              <Stack direction="horizontal" gap="sm" align="center">
                <Text variant="caption" weight="semibold">
                  Live Preview
                </Text>
                <Show when={components().length > 0}>
                  <Badge variant="info">
                    {`${components().length} components`}
                  </Badge>
                </Show>
              </Stack>
              <Stack direction="horizontal" gap="xs">
                <Button
                  variant={viewport() === "desktop" ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setViewport("desktop")}
                >
                  Desktop
                </Button>
                <Button
                  variant={viewport() === "tablet" ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setViewport("tablet")}
                >
                  Tablet
                </Button>
                <Button
                  variant={viewport() === "mobile" ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setViewport("mobile")}
                >
                  Mobile
                </Button>
                <Show when={components().length > 0}>
                  <Button variant="outline" size="sm" onClick={handleClear}>
                    Clear
                  </Button>
                </Show>
              </Stack>
            </Stack>
          </div>

          {/* Preview Canvas */}
          <div class="flex-1 overflow-y-auto p-6">
            <PreviewPanel components={components()} viewport={viewport()} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
