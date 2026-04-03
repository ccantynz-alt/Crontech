// ── StreamingPreview Component ────────────────────────────────────
// SolidJS component that renders a live preview of AI-generated UI
// as components stream in from the server. Shows loading skeletons,
// smooth transitions, error states, and retry controls.

import {
  type JSX,
  Show,
  For,
  createMemo,
  createEffect,
} from "solid-js";
import { Spinner } from "@back-to-the-future/ui";
import { renderComponentTree } from "~/lib/generative-ui";
import {
  createUIStream,
  type StreamingUI,
  type ComponentSlot,
  type StreamStatus,
  type StreamUIOptions,
} from "~/lib/streaming-ui";

// ── Props ────────────────────────────────────────────────────────

export interface StreamingPreviewProps {
  /** The API endpoint URL for streaming UI generation */
  url: string;
  /** Streaming options including the prompt */
  options: StreamUIOptions;
  /** Optional CSS class for the container */
  class?: string;
  /** Called when the stream completes successfully */
  onComplete?: (componentCount: number) => void;
  /** Called when the stream encounters an unrecoverable error */
  onError?: (error: string) => void;
}

// ── Skeleton Loader ──────────────────────────────────────────────

interface SkeletonProps {
  componentType: string;
}

/**
 * Renders a loading skeleton shaped to approximate the expected component.
 * Provides visual feedback while the AI generates each component.
 */
function ComponentSkeleton(props: SkeletonProps): JSX.Element {
  const heightClass = createMemo(() => {
    switch (props.componentType) {
      case "Card":
        return "h-32";
      case "Text":
        return "h-6";
      case "Button":
        return "h-10";
      case "Input":
      case "Select":
      case "Textarea":
        return "h-12";
      case "Modal":
        return "h-48";
      case "Stack":
        return "h-24";
      case "Tabs":
        return "h-16";
      case "Timeline":
      case "ChainOfCustody":
        return "h-40";
      case "ExhibitViewer":
        return "h-64";
      default:
        return "h-10";
    }
  });

  return (
    <div
      class={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700 ${heightClass()} w-full`}
      role="status"
      aria-label={`Loading ${props.componentType} component`}
    >
      <span class="sr-only">Loading {props.componentType}...</span>
    </div>
  );
}

// ── Slot Renderer ────────────────────────────────────────────────

interface SlotRendererProps {
  slot: ComponentSlot;
}

/**
 * Renders a single component slot based on its current status.
 * Handles the loading -> updating -> complete/error lifecycle.
 */
function SlotRenderer(props: SlotRendererProps): JSX.Element {
  return (
    <div
      class="transition-all duration-300 ease-in-out"
      classList={{
        "opacity-50": props.slot.status === "loading",
        "opacity-75": props.slot.status === "updating",
        "opacity-100": props.slot.status === "complete",
      }}
    >
      <Show when={props.slot.status === "complete" && props.slot.component !== undefined}>
        <div class="animate-fadeIn">
          {renderComponentTree(props.slot.component)}
        </div>
      </Show>

      <Show when={props.slot.status === "loading"}>
        <ComponentSkeleton componentType={props.slot.componentType} />
      </Show>

      <Show when={props.slot.status === "updating"}>
        <div class="relative">
          <ComponentSkeleton componentType={props.slot.componentType} />
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-xs text-gray-500 dark:text-gray-400">
              Generating {props.slot.componentType}...
            </span>
          </div>
        </div>
      </Show>

      <Show when={props.slot.status === "error"}>
        <div
          class="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300"
          role="alert"
        >
          <p class="font-medium">Failed to generate {props.slot.componentType}</p>
          <Show when={props.slot.error !== undefined}>
            <p class="mt-1 text-xs opacity-80">{props.slot.error}</p>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── Status Bar ───────────────────────────────────────────────────

interface StatusBarProps {
  status: StreamStatus;
  completedCount: number;
  totalCount: number;
}

function StatusBar(props: StatusBarProps): JSX.Element {
  const label = createMemo(() => {
    switch (props.status) {
      case "idle":
        return "Ready";
      case "connecting":
        return "Connecting...";
      case "streaming":
        return `Generating components (${props.completedCount} complete)`;
      case "complete":
        return `Complete -- ${props.totalCount} component${props.totalCount !== 1 ? "s" : ""} generated`;
      case "error":
        return "Error occurred";
    }
  });

  const progressPercent = createMemo(() => {
    if (props.status === "complete") return 100;
    if (props.totalCount > 0) {
      return Math.round((props.completedCount / props.totalCount) * 100);
    }
    // During streaming, show indeterminate progress based on completed count
    return Math.min(props.completedCount * 15, 90);
  });

  return (
    <div class="mb-3 space-y-1">
      <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label()}</span>
        <Show when={props.status === "streaming" || props.status === "complete"}>
          <span>{progressPercent()}%</span>
        </Show>
      </div>
      <Show when={props.status === "streaming" || props.status === "connecting"}>
        <div class="h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            class="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
            classList={{
              "animate-pulse": props.status === "connecting",
            }}
            style={{ width: `${progressPercent()}%` }}
          />
        </div>
      </Show>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

/**
 * StreamingPreview -- renders a live preview of AI-generated UI.
 *
 * Connects to an SSE endpoint and progressively renders components
 * as they arrive. Shows skeletons for loading components, smooth
 * transitions as they complete, and error/retry UI when needed.
 *
 * Usage:
 * ```tsx
 * <StreamingPreview
 *   url="/api/ai/stream-ui"
 *   options={{ body: { prompt: "Build a contact form" } }}
 *   onComplete={(count) => console.log(`Generated ${count} components`)}
 * />
 * ```
 */
export function StreamingPreview(props: StreamingPreviewProps): JSX.Element {
  const stream: StreamingUI = createUIStream(props.url, props.options);

  // Fire callbacks on status changes
  createEffect(() => {
    const currentStatus = stream.status();
    if (currentStatus === "complete" && props.onComplete) {
      props.onComplete(stream.totalCount());
    }
    if (currentStatus === "error") {
      const errorMessage = stream.error();
      if (errorMessage !== undefined && props.onError) {
        props.onError(errorMessage);
      }
    }
  });

  return (
    <div class={`streaming-preview ${props.class ?? ""}`}>
      <StatusBar
        status={stream.status()}
        completedCount={stream.completedCount()}
        totalCount={stream.totalCount()}
      />

      {/* Error state with retry */}
      <Show when={stream.status() === "error"}>
        <div
          class="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
          role="alert"
        >
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <p class="font-medium text-red-800 dark:text-red-200">
                Generation Failed
              </p>
              <Show when={stream.error() !== undefined}>
                <p class="mt-1 text-sm text-red-600 dark:text-red-300">
                  {stream.error()}
                </p>
              </Show>
            </div>
            <button
              type="button"
              class="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-200 dark:hover:bg-red-700"
              onClick={() => stream.retry()}
            >
              Retry
            </button>
          </div>
        </div>
      </Show>

      {/* Connecting state */}
      <Show when={stream.status() === "connecting"}>
        <div class="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
          <Spinner size="sm" />
          <span class="text-sm">Connecting to AI...</span>
        </div>
      </Show>

      {/* Component slots */}
      <Show when={stream.slots().length > 0}>
        <div class="space-y-3">
          <For each={stream.slots()}>
            {(slot) => <SlotRenderer slot={slot} />}
          </For>
        </div>
      </Show>

      {/* Completion state */}
      <Show when={stream.status() === "complete" && stream.totalCount() > 0}>
        <div class="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
          Generated {stream.totalCount()} component{stream.totalCount() !== 1 ? "s" : ""}
        </div>
      </Show>

      {/* Empty completion state */}
      <Show when={stream.status() === "complete" && stream.totalCount() === 0}>
        <div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No components were generated. Try a different prompt.
        </div>
      </Show>

      {/* Abort button during streaming */}
      <Show when={stream.status() === "streaming"}>
        <div class="mt-3 flex justify-end">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            onClick={() => stream.abort()}
          >
            Cancel
          </button>
        </div>
      </Show>
    </div>
  );
}
