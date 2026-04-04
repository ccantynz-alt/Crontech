// ── ComponentRenderer ────────────────────────────────────────────────
// Recursive component that renders a validated Component tree using
// real UI components from @back-to-the-future/ui. Each schema component
// maps to its SolidJS counterpart. Container components (Card, Stack,
// Modal, Alert, Tooltip) recursively render their children.

import { createMemo, For, Match, Switch } from "solid-js";
import type { JSX } from "solid-js";
import {
  Button,
  Input,
  Card,
  Stack,
  Text,
  Modal,
  Badge,
  Alert,
  Avatar,
  Tabs,
  Select,
  Textarea,
  Spinner,
  Tooltip,
  Separator,
} from "@back-to-the-future/ui";
import type { Component } from "@back-to-the-future/schemas";

// ── Props ────────────────────────────────────────────────────────────

interface ComponentRendererProps {
  component: Component;
}

// ── Helper: extract typed props ──────────────────────────────────────

function p<T = Record<string, unknown>>(comp: Component): T {
  return comp.props as unknown as T;
}

function getChildren(comp: Component): Component[] {
  if ("children" in comp && Array.isArray(comp.children)) {
    return comp.children as Component[];
  }
  return [];
}

// ── Renderer ─────────────────────────────────────────────────────────

export function ComponentRenderer(props: ComponentRendererProps): JSX.Element {
  const comp = createMemo(() => props.component);
  const children = createMemo(() => getChildren(comp()));

  return (
    <Switch
      fallback={
        <Text variant="caption">
          Unknown component: {comp().component}
        </Text>
      }
    >
      <Match when={comp().component === "Button"}>
        <Button
          variant={p<{ variant?: string }>(comp()).variant ?? "default"}
          size={p<{ size?: string }>(comp()).size ?? "md"}
          disabled={p<{ disabled?: boolean }>(comp()).disabled}
          loading={p<{ loading?: boolean }>(comp()).loading}
        >
          {p<{ label: string }>(comp()).label}
        </Button>
      </Match>

      <Match when={comp().component === "Input"}>
        <Input
          type={p<{ type?: string }>(comp()).type ?? "text"}
          placeholder={p<{ placeholder?: string }>(comp()).placeholder}
          label={p<{ label?: string }>(comp()).label}
          disabled={p<{ disabled?: boolean }>(comp()).disabled}
        />
      </Match>

      <Match when={comp().component === "Card"}>
        <Card
          title={p<{ title?: string }>(comp()).title}
          padding={p<{ padding?: string }>(comp()).padding ?? "md"}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Card>
      </Match>

      <Match when={comp().component === "Stack"}>
        <Stack
          direction={p<{ direction?: string }>(comp()).direction ?? "vertical"}
          gap={p<{ gap?: string }>(comp()).gap ?? "md"}
          align={p<{ align?: string }>(comp()).align}
          justify={p<{ justify?: string }>(comp()).justify}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Stack>
      </Match>

      <Match when={comp().component === "Text"}>
        <Text
          variant={p<{ variant?: string }>(comp()).variant ?? "body"}
          weight={p<{ weight?: string }>(comp()).weight ?? "normal"}
        >
          {p<{ content: string }>(comp()).content}
        </Text>
      </Match>

      <Match when={comp().component === "Modal"}>
        <Modal
          title={p<{ title: string }>(comp()).title}
          open={p<{ open?: boolean }>(comp()).open ?? false}
          size={p<{ size?: string }>(comp()).size ?? "md"}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Modal>
      </Match>

      <Match when={comp().component === "Badge"}>
        <Badge
          variant={p<{ variant?: string }>(comp()).variant ?? "default"}
          label={p<{ label: string }>(comp()).label}
        />
      </Match>

      <Match when={comp().component === "Alert"}>
        <Alert
          variant={p<{ variant?: string }>(comp()).variant ?? "info"}
          title={p<{ title?: string }>(comp()).title}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Alert>
      </Match>

      <Match when={comp().component === "Avatar"}>
        <Avatar
          src={p<{ src?: string }>(comp()).src}
          initials={p<{ initials?: string }>(comp()).initials}
          size={p<{ size?: string }>(comp()).size ?? "md"}
        />
      </Match>

      <Match when={comp().component === "Tabs"}>
        <Tabs
          items={
            p<{ items: Array<{ id: string; label: string }> }>(comp()).items
          }
          defaultTab={p<{ defaultTab?: string }>(comp()).defaultTab}
        />
      </Match>

      <Match when={comp().component === "Select"}>
        <Select
          options={
            p<{ options: Array<{ value: string; label: string }> }>(comp())
              .options
          }
          placeholder={p<{ placeholder?: string }>(comp()).placeholder}
          label={p<{ label?: string }>(comp()).label}
          disabled={p<{ disabled?: boolean }>(comp()).disabled}
        />
      </Match>

      <Match when={comp().component === "Textarea"}>
        <Textarea
          placeholder={p<{ placeholder?: string }>(comp()).placeholder}
          rows={p<{ rows?: number }>(comp()).rows ?? 3}
          label={p<{ label?: string }>(comp()).label}
          disabled={p<{ disabled?: boolean }>(comp()).disabled}
        />
      </Match>

      <Match when={comp().component === "Spinner"}>
        <Spinner
          size={p<{ size?: string }>(comp()).size ?? "md"}
        />
      </Match>

      <Match when={comp().component === "Tooltip"}>
        <Tooltip
          content={p<{ content: string }>(comp()).content}
          position={p<{ position?: string }>(comp()).position ?? "top"}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Tooltip>
      </Match>

      <Match when={comp().component === "Separator"}>
        <Separator
          orientation={
            p<{ orientation?: string }>(comp()).orientation ?? "horizontal"
          }
        />
      </Match>
    </Switch>
  );
}

// ── Tree Renderer ────────────────────────────────────────────────────
// Renders an array of Component nodes (e.g. a PageLayout.components list).

interface ComponentTreeProps {
  components: Component[];
}

export function ComponentTree(props: ComponentTreeProps): JSX.Element {
  return (
    <For each={props.components}>
      {(comp) => <ComponentRenderer component={comp} />}
    </For>
  );
}

export default ComponentRenderer;
