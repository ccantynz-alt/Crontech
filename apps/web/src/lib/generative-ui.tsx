import { type JSX, For } from "solid-js";
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
import { ComponentSchema } from "@back-to-the-future/schemas";
import type { Component } from "@back-to-the-future/schemas";
import { AIErrorBoundary } from "~/components/ErrorBoundary";

// ── Component Map ────────────────────────────────────────────────────
// Maps schema component names to actual SolidJS component implementations.

type ComponentMap = Record<string, (props: Record<string, unknown>) => JSX.Element>;

const componentMap: ComponentMap = {
  Button: (p) => <Button variant={p.variant as "default" | "primary" | "secondary" | "destructive" | "outline" | "ghost" | "link"} size={p.size as "sm" | "md" | "lg" | "icon"} disabled={p.disabled as boolean} loading={p.loading as boolean}>{p.label as string}</Button>,
  Input: (p) => <Input type={p.type as string} placeholder={p.placeholder as string} label={p.label as string} required={p.required as boolean} disabled={p.disabled as boolean} name={p.name as string} />,
  Card: (p) => <Card title={p.title as string} description={p.description as string} padding={p.padding as "none" | "sm" | "md" | "lg"}>{p.children as JSX.Element}</Card>,
  Stack: (p) => <Stack direction={p.direction as "horizontal" | "vertical"} gap={p.gap as "none" | "xs" | "sm" | "md" | "lg" | "xl"} align={p.align as "start" | "center" | "end" | "stretch"} justify={p.justify as "start" | "center" | "end" | "between" | "around"}>{p.children as JSX.Element}</Stack>,
  Text: (p) => <Text content={p.content as string} variant={p.variant as "h1" | "h2" | "h3" | "h4" | "body" | "caption" | "code"} weight={p.weight as "normal" | "medium" | "semibold" | "bold"} align={p.align as "left" | "center" | "right"} />,
  Modal: (p) => <Modal title={p.title as string} description={p.description as string} open={p.open as boolean} size={p.size as "sm" | "md" | "lg" | "xl"}>{p.children as JSX.Element}</Modal>,
  Badge: (p) => <Badge variant={p.variant as "default" | "success" | "warning" | "error" | "info"} size={p.size as "sm" | "md"}>{p.label as string}</Badge>,
  Alert: (p) => <Alert variant={p.variant as "info" | "success" | "warning" | "error"} title={p.title as string} description={p.description as string} dismissible={p.dismissible as boolean}>{p.children as JSX.Element}</Alert>,
  Avatar: (p) => <Avatar src={p.src as string} alt={p.alt as string} initials={p.initials as string} size={p.size as "sm" | "md" | "lg"} />,
  Tabs: (p) => <Tabs items={(p.items as Array<{ id: string; label: string; content: JSX.Element; disabled?: boolean }>) ?? []} defaultTab={p.defaultTab as string} />,
  Select: (p) => <Select options={(p.options as Array<{ value: string; label: string; disabled?: boolean }>) ?? []} value={p.value as string} placeholder={p.placeholder as string} label={p.label as string} error={p.error as string} disabled={p.disabled as boolean} name={p.name as string} />,
  Textarea: (p) => <Textarea label={p.label as string} error={p.error as string} placeholder={p.placeholder as string} rows={p.rows as number} resize={p.resize as "none" | "vertical" | "horizontal" | "both"} required={p.required as boolean} disabled={p.disabled as boolean} name={p.name as string} />,
  Spinner: (p) => <Spinner size={p.size as "sm" | "md" | "lg"} />,
  Tooltip: (p) => <Tooltip content={p.content as string} position={p.position as "top" | "bottom" | "left" | "right"}>{p.children as JSX.Element}</Tooltip>,
  Separator: (p) => <Separator orientation={p.orientation as "horizontal" | "vertical"} />,
};

// ── Render Helpers ───────────────────────────────────────────────────

/**
 * Renders a single validated component node, recursively handling children.
 */
function renderNode(node: Component): JSX.Element {
  const componentName = node.component;
  const renderer = componentMap[componentName];

  if (!renderer) {
    return (
      <Alert variant="error" title="Unknown Component">
        <Text
          content={`Component "${componentName}" is not registered in the component map.`}
          variant="body"
        />
      </Alert>
    );
  }

  const props: Record<string, unknown> = { ...node.props };

  // Recursively render children if the node has them
  if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
    const childNodes = node.children as Component[];
    props.children = (
      <For each={childNodes}>
        {(child) => renderNode(child)}
      </For>
    );
  }

  return renderer(props);
}

/**
 * Validates the config against ComponentSchema and renders the component tree.
 * Returns an error Alert component if validation fails.
 */
export function renderComponentTree(config: unknown): JSX.Element {
  const result = ComponentSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    return (
      <Alert variant="error" title="Invalid Component Configuration">
        <Text
          content={`Validation failed: ${issues}`}
          variant="body"
        />
      </Alert>
    );
  }

  return renderNode(result.data as Component);
}

// ── GenerativeUI Component ───────────────────────────────────────────

export interface GenerativeUIProps {
  config: unknown;
}

/**
 * SolidJS component that renders an AI-generated component tree from config.
 * Validates the config against the ComponentSchema and wraps output in AIErrorBoundary.
 */
export function GenerativeUI(props: GenerativeUIProps): JSX.Element {
  return (
    <AIErrorBoundary
      onError={(error, info) => {
        console.error(
          `[GenerativeUI] Render error in "${info.componentName}":`,
          error.message,
        );
      }}
    >
      {renderComponentTree(props.config)}
    </AIErrorBoundary>
  );
}
