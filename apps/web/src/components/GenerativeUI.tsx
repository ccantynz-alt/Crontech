// ── Generative UI Renderer ───────────────────────────────────────────
// Renders AI-generated component trees from validated JSON.
// The AI generates → Zod validates → this renders. No raw HTML ever.

import type { Component } from "@back-to-the-future/schemas";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Separator,
  Spinner,
  Stack,
  Tabs,
  Text,
  Textarea,
  Tooltip,
} from "@back-to-the-future/ui";
import { For, Match, Show, Switch, createMemo } from "solid-js";
import type { JSX } from "solid-js";

// ── Ghost ID counter ──────────────────────────────────────────────────
// Matches the counter in GhostMode.tsx's extractInteractives() so that
// data-ghost-id values on the rendered DOM nodes align 1:1 with the
// logical IDs the ghost cursor uses for lookup.
// Reset by GenerativeUIRenderer before each render pass when
// enableGhostIds is active.

let _ghostRenderSeq = 0;

/** Call once per full tree render when enableGhostIds=true. */
export function resetGhostRenderSeq(): void {
  _ghostRenderSeq = 0;
}

function nextGhostId(): string {
  _ghostRenderSeq++;
  return `ghost-${_ghostRenderSeq}`;
}

// ── Component Renderer ───────────────────────────────────────────────

interface ComponentRendererProps {
  component: Component;
  /** When true, interactive elements receive data-ghost-id attributes */
  enableGhostIds?: boolean | undefined;
}

/**
 * Recursively renders a validated component tree.
 * Each component is matched by its discriminated "component" field.
 * When enableGhostIds is true, interactive elements receive
 * data-ghost-id attributes so GhostMode can find them in the DOM.
 */
function ComponentRenderer(props: ComponentRendererProps): JSX.Element {
  const comp = createMemo(() => props.component);
  const ghostIds = createMemo(() => props.enableGhostIds ?? false);
  const children = createMemo(() => {
    const c = comp();
    if ("children" in c && Array.isArray(c.children)) {
      return c.children as Component[];
    }
    return [];
  });

  return (
    <Switch fallback={<Text variant="caption">Unknown component: {comp().component}</Text>}>
      <Match when={comp().component === "Button"}>
        {/* Wrap in a span so we can attach data-ghost-id without
            altering the Button component's own DOM node contract. */}
        <span
          data-ghost-id={ghostIds() ? nextGhostId() : undefined}
          style={{ display: "contents" }}
        >
          <Button
            variant={
              ((comp() as { props: { variant?: string } }).props.variant as
                | "primary"
                | "default") ?? "default"
            }
            size={
              ((comp() as { props: { size?: string } }).props.size as "sm" | "md" | "lg") ?? "md"
            }
            disabled={(comp() as { props: { disabled?: boolean } }).props.disabled}
            loading={(comp() as { props: { loading?: boolean } }).props.loading}
          >
            {(comp() as { props: { label: string } }).props.label}
          </Button>
        </span>
      </Match>

      <Match when={comp().component === "Input"}>
        <span
          data-ghost-id={ghostIds() ? nextGhostId() : undefined}
          style={{ display: "contents" }}
        >
          <Input
            type={
              ((comp() as { props: { type?: string } }).props.type as "text" | "email") ?? "text"
            }
            placeholder={(comp() as { props: { placeholder?: string } }).props.placeholder}
            label={(comp() as { props: { label?: string } }).props.label}
            disabled={(comp() as { props: { disabled?: boolean } }).props.disabled}
          />
        </span>
      </Match>

      <Match when={comp().component === "Card"}>
        <Card
          title={(comp() as { props: { title?: string } }).props.title}
          padding={
            ((comp() as { props: { padding?: string } }).props.padding as
              | "none"
              | "sm"
              | "md"
              | "lg") ?? "md"
          }
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} enableGhostIds={ghostIds()} />}
          </For>
        </Card>
      </Match>

      <Match when={comp().component === "Stack"}>
        <Stack
          direction={
            ((comp() as { props: { direction?: string } }).props.direction as
              | "horizontal"
              | "vertical") ?? "vertical"
          }
          gap={
            ((comp() as { props: { gap?: string } }).props.gap as
              | "none"
              | "xs"
              | "sm"
              | "md"
              | "lg"
              | "xl") ?? "md"
          }
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} enableGhostIds={ghostIds()} />}
          </For>
        </Stack>
      </Match>

      <Match when={comp().component === "Text"}>
        <Text
          variant={
            ((comp() as { props: { variant?: string } }).props.variant as "h1" | "h2" | "body") ??
            "body"
          }
          weight={
            ((comp() as { props: { weight?: string } }).props.weight as "normal" | "bold") ??
            "normal"
          }
        >
          {(comp() as { props: { content: string } }).props.content}
        </Text>
      </Match>

      <Match when={comp().component === "Modal"}>
        <Modal
          title={(comp() as { props: { title: string } }).props.title}
          open={(comp() as { props: { open?: boolean } }).props.open ?? false}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} enableGhostIds={ghostIds()} />}
          </For>
        </Modal>
      </Match>

      <Match when={comp().component === "Badge"}>
        <Badge
          variant={
            ((comp() as { props: { variant?: string } }).props.variant as "default" | "success") ??
            "default"
          }
          label={(comp() as { props: { label: string } }).props.label}
        />
      </Match>

      <Match when={comp().component === "Alert"}>
        <Alert
          variant={
            ((comp() as { props: { variant?: string } }).props.variant as "info" | "error") ??
            "info"
          }
          title={(comp() as { props: { title?: string } }).props.title}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} enableGhostIds={ghostIds()} />}
          </For>
        </Alert>
      </Match>

      <Match when={comp().component === "Avatar"}>
        <Avatar
          initials={(comp() as { props: { initials?: string } }).props.initials}
          size={((comp() as { props: { size?: string } }).props.size as "sm" | "md" | "lg") ?? "md"}
        />
      </Match>

      <Match when={comp().component === "Tabs"}>
        {/* Tab items are individually clickable via their native
            id="tab-<id>" attributes — GhostMode targets those directly,
            so no data-ghost-id wrapper is needed here. */}
        <Tabs
          items={(comp() as { props: { items: Array<{ id: string; label: string }> } }).props.items}
        />
      </Match>

      <Match when={comp().component === "Select"}>
        <span
          data-ghost-id={ghostIds() ? nextGhostId() : undefined}
          style={{ display: "contents" }}
        >
          <Select
            options={
              (comp() as { props: { options: Array<{ value: string; label: string }> } }).props
                .options
            }
            placeholder={(comp() as { props: { placeholder?: string } }).props.placeholder}
          />
        </span>
      </Match>

      <Match when={comp().component === "Textarea"}>
        <span
          data-ghost-id={ghostIds() ? nextGhostId() : undefined}
          style={{ display: "contents" }}
        >
          <Textarea
            placeholder={(comp() as { props: { placeholder?: string } }).props.placeholder}
            rows={(comp() as { props: { rows?: number } }).props.rows ?? 3}
          />
        </span>
      </Match>

      <Match when={comp().component === "Spinner"}>
        <Spinner
          size={((comp() as { props: { size?: string } }).props.size as "sm" | "md" | "lg") ?? "md"}
        />
      </Match>

      <Match when={comp().component === "Tooltip"}>
        <Tooltip content={(comp() as { props: { content: string } }).props.content}>
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} enableGhostIds={ghostIds()} />}
          </For>
        </Tooltip>
      </Match>

      <Match when={comp().component === "Separator"}>
        <Separator
          orientation={
            ((comp() as { props: { orientation?: string } }).props.orientation as
              | "horizontal"
              | "vertical") ?? "horizontal"
          }
        />
      </Match>
    </Switch>
  );
}

// ── Tree Renderer ────────────────────────────────────────────────────

interface GenerativeUIProps {
  /** Validated component tree from AI */
  tree: Component[];
  /** Show empty state when tree is empty */
  emptyMessage?: string | undefined;
  /**
   * When true, interactive elements in the rendered tree receive
   * `data-ghost-id` attributes so GhostMode can locate them in the DOM.
   * The IDs are assigned in depth-first order matching extractInteractives().
   */
  enableGhostIds?: boolean | undefined;
}

/**
 * Renders a complete AI-generated component tree.
 * Pass the validated output from processGenerativeUIOutput().
 */
export function GenerativeUIRenderer(props: GenerativeUIProps): JSX.Element {
  // Reset the ghost render counter at the top of each tree render so
  // IDs match the sequence produced by extractInteractives().
  if (props.enableGhostIds) {
    resetGhostRenderSeq();
  }

  return (
    <Show
      when={props.tree.length > 0}
      fallback={
        <Stack direction="vertical" align="center" justify="center" gap="md">
          <Text variant="body" class="text-muted">
            {props.emptyMessage ?? "No components generated yet."}
          </Text>
        </Stack>
      }
    >
      <Stack direction="vertical" gap="md">
        <For each={props.tree}>
          {(component) => (
            <ComponentRenderer component={component} enableGhostIds={props.enableGhostIds} />
          )}
        </For>
      </Stack>
    </Show>
  );
}

export { ComponentRenderer };
