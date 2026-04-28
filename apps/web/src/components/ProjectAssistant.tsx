import type { Component } from "@back-to-the-future/schemas";
import { Badge, Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";

// ── Project Assistant ──────────────────────────────────────────────
// Sidebar panel that lists AI suggestions for the current project.
// Re-analyzes every 5 seconds when the project changes.
// Each suggestion has a "Yes, do it" button that applies it automatically.

export type Severity = "info" | "tip" | "warning";

export interface AssistantSuggestion {
  id: string;
  title: string;
  description: string;
  severity: Severity;
}

export interface ProjectAssistantProps {
  // The current component tree being edited.
  tree: () => Component[];
  // Apply a suggestion by ID. Builder wires this up.
  onApply: (suggestionId: string) => void | Promise<void>;
  // Optional analyzer override. Defaults to rule-based local analyzer.
  analyze?: (tree: Component[]) => AssistantSuggestion[];
}

// Local copy of the rule-based analyzer (so this works without the API).
function defaultAnalyze(tree: Component[]): AssistantSuggestion[] {
  const out: AssistantSuggestion[] = [];
  const flat: Component[] = [];
  const visit = (n: Component): void => {
    flat.push(n);
    const kids = (n as { children?: Component[] }).children;
    if (Array.isArray(kids)) for (const c of kids) visit(c);
  };
  for (const n of tree) visit(n);

  const has = (name: string): boolean => flat.some((c) => c.component === name);
  const hasButtonLike = (kw: string[]): boolean =>
    flat.some(
      (c) =>
        c.component === "Button" &&
        kw.some((k) => ((c.props as { label?: string }).label?.toLowerCase() ?? "").includes(k)),
    );

  if (!hasButtonLike(["start", "sign up", "buy", "get", "try", "join", "contact"])) {
    out.push({
      id: "missing-cta",
      title: "Your page is missing a call-to-action button.",
      description: "Want me to add a 'Get Started' button at the bottom?",
      severity: "tip",
    });
  }
  if (
    !flat.some((c) => c.component === "Text" && (c.props as { variant?: string }).variant === "h1")
  ) {
    out.push({
      id: "missing-headline",
      title: "There is no main headline on this page.",
      description: "Shall I add a clear H1 headline at the top?",
      severity: "warning",
    });
  }
  if (!has("Input") && !has("Textarea")) {
    out.push({
      id: "add-contact-form",
      title: "Add a contact form?",
      description: "Letting visitors reach out is one of the easiest ways to grow.",
      severity: "info",
    });
  }
  if (tree.length > 4 && !has("Stack")) {
    out.push({
      id: "needs-spacing",
      title: "This section could use better spacing.",
      description: "Want me to wrap your content in a tidy Stack layout?",
      severity: "tip",
    });
  }
  return out;
}

function severityVariant(s: Severity): "info" | "warning" | "default" {
  if (s === "warning") return "warning";
  if (s === "info") return "info";
  return "default";
}

export function ProjectAssistant(props: ProjectAssistantProps): ReturnType<typeof Card> {
  const [suggestions, setSuggestions] = createSignal<AssistantSuggestion[]>([]);
  const [lastRun, setLastRun] = createSignal<number>(0);

  const runAnalysis = (): void => {
    const fn = props.analyze ?? defaultAnalyze;
    setSuggestions(fn(props.tree()));
    setLastRun(Date.now());
  };

  // Re-run every 5 seconds when the project might have changed.
  createEffect(() => {
    runAnalysis();
  });

  let timer: ReturnType<typeof setInterval> | undefined;
  if (typeof window !== "undefined") {
    timer = setInterval(runAnalysis, 5000);
  }
  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  return (
    <Card title="AI Project Assistant" padding="md">
      <Stack direction="vertical" gap="md" align="stretch" justify="start">
        <Text variant="caption">Smart suggestions based on what's in your project right now.</Text>
        <Show
          when={suggestions().length > 0}
          fallback={
            <Text variant="body">Looking great! No suggestions right now. Keep building.</Text>
          }
        >
          <For each={suggestions()}>
            {(s) => (
              <Card padding="sm">
                <Stack direction="vertical" gap="sm" align="stretch" justify="start">
                  <Stack direction="horizontal" gap="sm" align="center" justify="start">
                    <Badge variant={severityVariant(s.severity)} size="sm">
                      {s.severity}
                    </Badge>
                    <Text variant="h4" weight="semibold">
                      {s.title}
                    </Text>
                  </Stack>
                  <Text variant="body">{s.description}</Text>
                  <Stack direction="horizontal" gap="sm" align="center" justify="start">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        void props.onApply(s.id);
                        setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                      }}
                    >
                      Yes, do it
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSuggestions((prev) => prev.filter((x) => x.id !== s.id))}
                    >
                      Dismiss
                    </Button>
                  </Stack>
                </Stack>
              </Card>
            )}
          </For>
        </Show>
        <Text variant="caption">
          Last checked: {lastRun() === 0 ? "just now" : new Date(lastRun()).toLocaleTimeString()}
        </Text>
      </Stack>
    </Card>
  );
}
