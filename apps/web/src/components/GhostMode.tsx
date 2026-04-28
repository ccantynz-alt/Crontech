// ── Ghost Mode ───────────────────────────────────────────────────────
// An AI "agent cursor" that walks the rendered component tree,
// visits every interactive element, simulates a click, and logs
// pass/fail results. Crontech's generated UIs become testable in
// seconds — no human needed.
//
// Architecture:
//  - extractInteractives()  → pure tree-walk, no DOM
//  - createEffect + timer   → drives the walk, one element at a time
//  - data-ghost-id attr     → bridges logical element ↔ real DOM node
//  - GhostCursor div        → CSS overlay, no library dependency
//  - ResultsPanel           → @back-to-the-future/ui Card/Stack/Text/Badge

import type { PageLayout } from "@back-to-the-future/ai-core";
import type { Component } from "@back-to-the-future/schemas";
import { Badge, Card, Stack, Text } from "@back-to-the-future/ui";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";

// ── Public Types ─────────────────────────────────────────────────────

export interface GhostResult {
  elementId: string;
  label: string;
  type: "button" | "input" | "link" | "tab" | "select";
  status: "ok" | "error" | "skipped";
  error?: string | undefined;
}

export interface GhostModeProps {
  /** The layout being tested */
  layout: PageLayout | null | undefined;
  /** Whether ghost mode is active */
  active: boolean;
  /** Callback when the walk completes */
  onComplete?: ((results: GhostResult[]) => void) | undefined;
}

// ── Internal Types ───────────────────────────────────────────────────

interface InteractiveElement {
  id: string;
  label: string;
  type: "button" | "input" | "link" | "tab" | "select";
}

// ── Tree Walker ──────────────────────────────────────────────────────
// Pure function — no DOM, no signals. Extracts every interactive
// element from the validated component tree in depth-first order.

let _ghostSeq = 0;
function nextId(): string {
  _ghostSeq++;
  return `ghost-${_ghostSeq}`;
}

function extractFromNode(node: Component, out: InteractiveElement[]): void {
  switch (node.component) {
    case "Button":
      out.push({
        id: nextId(),
        label: node.props.label || "Button",
        type: "button",
      });
      break;

    case "Input":
      out.push({
        id: nextId(),
        label: node.props.label ?? node.props.placeholder ?? node.props.name ?? "Input",
        type: "input",
      });
      break;

    case "Select":
      out.push({
        id: nextId(),
        label: node.props.label ?? node.props.placeholder ?? "Select",
        type: "select",
      });
      break;

    case "Tabs": {
      // Each tab item is individually interactive.
      // elementId stores the tab's own `id` so the DOM lookup can use
      // the existing `#tab-<id>` attribute from the Tabs UI component
      // rather than requiring a data-ghost-id wrapper.
      for (const item of node.props.items) {
        out.push({
          id: item.id,
          label: item.label,
          type: "tab",
        });
      }
      break;
    }

    case "Textarea":
      out.push({
        id: nextId(),
        label: node.props.label ?? node.props.placeholder ?? "Textarea",
        type: "input",
      });
      break;

    // Container types — recurse into children only
    case "Card":
    case "Stack":
    case "Modal":
    case "Alert":
    case "Tooltip":
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children as Component[]) {
          extractFromNode(child, out);
        }
      }
      break;

    // Non-interactive leaf nodes — skip
    case "Text":
    case "Badge":
    case "Avatar":
    case "Spinner":
    case "Separator":
      break;
  }
}

export function extractInteractives(layout: PageLayout): InteractiveElement[] {
  // Reset sequence counter each walk so IDs are stable per-layout
  _ghostSeq = 0;
  const out: InteractiveElement[] = [];
  for (const node of layout.components) {
    extractFromNode(node, out);
  }
  return out;
}

// ── Ghost Cursor ─────────────────────────────────────────────────────
// Absolutely-positioned overlay div with a glowing violet ring.
// Positioned by (x, y) from getBoundingClientRect of the target element.

interface GhostCursorProps {
  x: number;
  y: number;
  visible: boolean;
}

function GhostCursor(props: GhostCursorProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: `${props.x}px`,
        top: `${props.y}px`,
        width: "28px",
        height: "28px",
        "border-radius": "50%",
        background: "rgba(139, 92, 246, 0.15)",
        "box-shadow": "0 0 0 2px rgba(139, 92, 246, 0.8), 0 0 16px rgba(139, 92, 246, 0.4)",
        transform: "translate(-50%, -50%)",
        transition: "left 400ms ease, top 400ms ease, opacity 200ms ease",
        opacity: props.visible ? "1" : "0",
        "pointer-events": "none",
        "z-index": "99999",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
      }}
    >
      {/* Inner pulse dot */}
      <div
        style={{
          width: "6px",
          height: "6px",
          "border-radius": "50%",
          background: "rgba(139, 92, 246, 0.9)",
        }}
      />
    </div>
  );
}

// ── Results Panel ────────────────────────────────────────────────────

function statusBadgeVariant(
  status: GhostResult["status"],
): "success" | "error" | "warning" | "default" {
  switch (status) {
    case "ok":
      return "success";
    case "error":
      return "error";
    case "skipped":
      return "warning";
  }
}

function statusLabel(status: GhostResult["status"]): string {
  switch (status) {
    case "ok":
      return "pass";
    case "error":
      return "fail";
    case "skipped":
      return "skip";
  }
}

interface ResultsPanelProps {
  results: GhostResult[];
  currentIndex: number;
  total: number;
  done: boolean;
}

function ResultsPanel(props: ResultsPanelProps): JSX.Element {
  const passCount = createMemo(() => props.results.filter((r) => r.status === "ok").length);
  const failCount = createMemo(() => props.results.filter((r) => r.status === "error").length);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(640px, calc(100vw - 32px))",
        "z-index": "99998",
        "max-height": "220px",
        overflow: "hidden",
        display: "flex",
        "flex-direction": "column",
      }}
    >
      <Card padding="sm">
        <Stack direction="vertical" gap="xs">
          {/* Header row */}
          <Stack direction="horizontal" gap="sm" align="center" justify="between">
            <Stack direction="horizontal" gap="xs" align="center">
              <Text variant="caption" weight="semibold">
                Ghost Walk
              </Text>
              <Show when={!props.done && props.currentIndex >= 0}>
                <Text variant="caption">
                  {Math.min(props.currentIndex + 1, props.total)}/{props.total}
                </Text>
              </Show>
            </Stack>
            <Stack direction="horizontal" gap="xs" align="center">
              <Show when={props.done}>
                <Badge variant="success" size="sm" label={`${passCount()}/${props.total} passed`} />
                <Show when={failCount() > 0}>
                  <Badge variant="error" size="sm" label={`${failCount()} failed`} />
                </Show>
              </Show>
              <Show when={!props.done}>
                <Badge variant="info" size="sm" label="walking..." />
              </Show>
            </Stack>
          </Stack>

          {/* Result rows */}
          <div
            style={{
              "max-height": "148px",
              "overflow-y": "auto",
              display: "flex",
              "flex-direction": "column",
              gap: "2px",
            }}
          >
            <For each={props.results}>
              {(result) => (
                <Stack direction="horizontal" gap="xs" align="center">
                  <Badge
                    variant={statusBadgeVariant(result.status)}
                    size="sm"
                    label={statusLabel(result.status)}
                  />
                  <Text variant="caption" weight="semibold">
                    {result.type}
                  </Text>
                  <Text variant="caption">{result.label}</Text>
                  <Show when={result.error !== undefined}>
                    <Text variant="caption">— {result.error}</Text>
                  </Show>
                </Stack>
              )}
            </For>
          </div>
        </Stack>
      </Card>
    </div>
  );
}

// ── Ghost Mode Overlay ───────────────────────────────────────────────

// Timing constants (ms)
const PAUSE_MS = 800; // dwell on each element before moving
const MOVE_MS = 400; // matches CSS transition duration

/**
 * GhostMode renders an overlay over the live builder preview.
 * When `active` switches to true, the ghost cursor walks every
 * interactive element in the component tree, fires a synthetic
 * click on each DOM node (found via data-ghost-id), and records
 * whether the click succeeded or threw.
 */
export function GhostMode(props: GhostModeProps): JSX.Element {
  const [currentIndex, setCurrentIndex] = createSignal(-1);
  const [results, setResults] = createSignal<GhostResult[]>([]);
  const [cursorX, setCursorX] = createSignal(0);
  const [cursorY, setCursorY] = createSignal(0);
  const [done, setDone] = createSignal(false);

  const interactives = createMemo((): InteractiveElement[] => {
    const layout = props.layout;
    if (!layout) return [];
    return extractInteractives(layout);
  });

  // Reset state whenever the walk starts fresh (active flips to true
  // or layout changes while active).
  createEffect(() => {
    if (!props.active) {
      setCurrentIndex(-1);
      setResults([]);
      setDone(false);
      return;
    }

    const elems = interactives();
    if (elems.length === 0) {
      setDone(true);
      props.onComplete?.([]);
      return;
    }

    // Reset for a fresh walk
    setCurrentIndex(0);
    setResults([]);
    setDone(false);
  });

  // Drive the walk: each time currentIndex changes, locate the DOM
  // node, move the cursor, pause, simulate click, record result,
  // then advance to the next element.
  createEffect(() => {
    const idx = currentIndex();
    if (!props.active || idx < 0) return;

    const elems = interactives();
    if (idx >= elems.length) {
      // Walk complete
      setDone(true);
      const finalResults = results();
      props.onComplete?.(finalResults);
      return;
    }

    const elem = elems[idx];
    if (!elem) return;

    // Locate the DOM node.
    // Tabs use the existing `id="tab-<tabId>"` attr from the Tabs
    // UI component — no data-ghost-id wrapper needed.
    // All other interactive types use data-ghost-id.
    const domNode =
      elem.type === "tab"
        ? document.getElementById(`tab-${elem.id}`)
        : document.querySelector<HTMLElement>(`[data-ghost-id="${elem.id}"]`);

    // Move cursor to the element (or centre of viewport if not found)
    if (domNode) {
      const rect = domNode.getBoundingClientRect();
      setCursorX(rect.left + rect.width / 2);
      setCursorY(rect.top + rect.height / 2);
    } else {
      setCursorX(window.innerWidth / 2);
      setCursorY(window.innerHeight / 2);
    }

    // Wait for the CSS transition + dwell, then click and advance
    const timer = setTimeout(() => {
      let status: GhostResult["status"] = "skipped";
      let errorMsg: string | undefined;

      if (domNode) {
        try {
          domNode.click();
          status = "ok";
        } catch (err) {
          status = "error";
          errorMsg = err instanceof Error ? err.message : String(err);
        }
      } else {
        status = "skipped";
        errorMsg = "DOM node not found";
      }

      const result: GhostResult = {
        elementId: elem.id,
        label: elem.label,
        type: elem.type,
        status,
        ...(errorMsg !== undefined ? { error: errorMsg } : {}),
      };

      setResults((prev) => [...prev, result]);
      setCurrentIndex((prev) => prev + 1);
    }, MOVE_MS + PAUSE_MS);

    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Show when={props.active}>
      {/* Invisible full-screen overlay that captures the walk state */}
      <div
        aria-label="Ghost Mode active — walking interactive elements"
        style={{
          position: "fixed",
          inset: "0",
          "pointer-events": "none",
          "z-index": "99990",
        }}
      >
        {/* No-layout fallback */}
        <Show when={!props.layout}>
          <div
            style={{
              position: "absolute",
              inset: "0",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
            }}
          >
            <Card padding="md">
              <Text variant="body">No layout to test</Text>
            </Card>
          </div>
        </Show>

        {/* Ghost cursor */}
        <GhostCursor x={cursorX()} y={cursorY()} visible={currentIndex() >= 0 && !done()} />

        {/* Results panel */}
        <Show when={results().length > 0 || done()}>
          <ResultsPanel
            results={results()}
            currentIndex={currentIndex()}
            total={interactives().length}
            done={done()}
          />
        </Show>
      </div>
    </Show>
  );
}
