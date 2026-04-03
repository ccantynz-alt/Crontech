// ── Client-Side UI Stream Consumer ────────────────────────────────
// Connects to the generative UI SSE endpoint and provides SolidJS
// signals for reactive rendering of progressively-arriving components.
// Handles reconnection, error states, and stream lifecycle.

import { createSignal, batch, onCleanup } from "solid-js";
import type { Component } from "@back-to-the-future/schemas";

// ── Stream Event Types (mirrored from server) ────────────────────

export interface ComponentStartEvent {
  type: "component-start";
  id: string;
  componentType: string;
  timestamp: number;
}

export interface ComponentUpdateEvent {
  type: "component-update";
  id: string;
  partial: Record<string, unknown>;
  timestamp: number;
}

export interface ComponentCompleteEvent {
  type: "component-complete";
  id: string;
  component: Component;
  timestamp: number;
}

export interface ComponentErrorEvent {
  type: "component-error";
  id: string;
  error: string;
  timestamp: number;
}

export interface StreamDoneEvent {
  type: "stream-done";
  totalComponents: number;
  timestamp: number;
}

export type StreamEvent =
  | ComponentStartEvent
  | ComponentUpdateEvent
  | ComponentCompleteEvent
  | ComponentErrorEvent
  | StreamDoneEvent;

// ── Component Slot State ─────────────────────────────────────────

export type ComponentSlotStatus = "loading" | "updating" | "complete" | "error";

export interface ComponentSlot {
  id: string;
  status: ComponentSlotStatus;
  componentType: string;
  partial: Record<string, unknown> | undefined;
  component: Component | undefined;
  error: string | undefined;
}

// ── Stream Status ────────────────────────────────────────────────

export type StreamStatus = "idle" | "connecting" | "streaming" | "complete" | "error";

// ── StreamingUI Return Type ──────────────────────────────────────

export interface StreamingUI {
  /** Reactive signal: current list of component slots */
  slots: () => ReadonlyArray<ComponentSlot>;
  /** Reactive signal: overall stream status */
  status: () => StreamStatus;
  /** Reactive signal: error message if status is "error" */
  error: () => string | undefined;
  /** Reactive signal: number of fully completed components */
  completedCount: () => number;
  /** Reactive signal: total components expected (set when stream finishes) */
  totalCount: () => number;
  /** Abort the stream and clean up */
  abort: () => void;
  /** Retry the stream from scratch */
  retry: () => void;
}

// ── Configuration ────────────────────────────────────────────────

export interface StreamUIOptions {
  /** Request body to POST to the endpoint */
  body: {
    prompt: string;
    computeTier?: "client" | "edge" | "cloud";
    temperature?: number;
    maxComponents?: number;
  };
  /** Maximum reconnection attempts before giving up */
  maxRetries?: number;
  /** Called for each stream event (for logging / telemetry) */
  onEvent?: (event: StreamEvent) => void;
}

// ── Internal: Parse an SSE line into an event ────────────────────

function parseStreamEvent(eventType: string, data: string): StreamEvent | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    // Validate that the parsed type matches the event type
    if (typeof parsed.type === "string" && parsed.type === eventType) {
      return parsed as unknown as StreamEvent;
    }
    // If the type field is missing, use the SSE event name
    return { ...parsed, type: eventType } as unknown as StreamEvent;
  } catch {
    return null;
  }
}

// ── Main Entry Point ─────────────────────────────────────────────

/**
 * Creates a reactive SSE connection to the generative UI streaming endpoint.
 *
 * Returns SolidJS signals that update as components stream in.
 * Use `slots()` to render a live preview. Each slot tracks its own
 * loading/updating/complete/error lifecycle.
 *
 * @param url - The SSE endpoint URL (e.g., "/api/ai/stream-ui")
 * @param options - Stream configuration including the prompt
 * @returns StreamingUI with reactive signals and control methods
 */
export function createUIStream(url: string, options: StreamUIOptions): StreamingUI {
  const [slots, setSlots] = createSignal<ReadonlyArray<ComponentSlot>>([]);
  const [status, setStatus] = createSignal<StreamStatus>("idle");
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [completedCount, setCompletedCount] = createSignal(0);
  const [totalCount, setTotalCount] = createSignal(0);

  let abortController: AbortController | null = null;
  let retryCount = 0;
  const maxRetries = options.maxRetries ?? 3;

  // ── Slot Management ──────────────────────────────────────────

  function updateSlot(id: string, updater: (slot: ComponentSlot) => ComponentSlot): void {
    setSlots((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      if (index === -1) return prev;
      const updated = [...prev];
      const existing = prev[index];
      if (!existing) return prev;
      updated[index] = updater(existing);
      return updated;
    });
  }

  function addSlot(slot: ComponentSlot): void {
    setSlots((prev) => [...prev, slot]);
  }

  // ── Event Handlers ───────────────────────────────────────────

  function handleEvent(event: StreamEvent): void {
    options.onEvent?.(event);

    switch (event.type) {
      case "component-start": {
        addSlot({
          id: event.id,
          status: "loading",
          componentType: event.componentType,
          partial: undefined,
          component: undefined,
          error: undefined,
        });
        break;
      }
      case "component-update": {
        updateSlot(event.id, (slot) => ({
          ...slot,
          status: "updating",
          partial: event.partial,
        }));
        break;
      }
      case "component-complete": {
        updateSlot(event.id, (slot) => ({
          ...slot,
          status: "complete",
          component: event.component,
          partial: undefined,
        }));
        setCompletedCount((c) => c + 1);
        break;
      }
      case "component-error": {
        updateSlot(event.id, (slot) => ({
          ...slot,
          status: "error",
          error: event.error,
        }));
        break;
      }
      case "stream-done": {
        batch(() => {
          setTotalCount(event.totalComponents);
          setStatus("complete");
        });
        break;
      }
    }
  }

  // ── Stream Connection ────────────────────────────────────────

  async function connect(): Promise<void> {
    abortController = new AbortController();
    const signal = abortController.signal;

    batch(() => {
      setStatus("connecting");
      setError(undefined);
      setSlots([]);
      setCompletedCount(0);
      setTotalCount(0);
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(options.body),
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      if (!response.body) {
        throw new Error("Response body is null -- SSE not supported");
      }

      setStatus("streaming");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let currentData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "" && currentEvent && currentData) {
            // Empty line = end of SSE message
            if (currentEvent !== "keepalive") {
              const event = parseStreamEvent(currentEvent, currentData);
              if (event) {
                handleEvent(event);
              }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }

      // If we finish reading without a stream-done event, mark complete
      if (status() === "streaming") {
        setStatus("complete");
      }
    } catch (err) {
      if (signal.aborted) {
        // User-initiated abort -- not an error
        return;
      }

      const message = err instanceof Error ? err.message : "Stream connection failed";

      if (retryCount < maxRetries) {
        retryCount += 1;
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.min(1000 * 2 ** (retryCount - 1), 8000);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          // If abort is called during retry wait, clear the timer
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });

        if (!signal.aborted) {
          await connect();
        }
      } else {
        batch(() => {
          setStatus("error");
          setError(message);
        });
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────

  function abort(): void {
    abortController?.abort();
    abortController = null;
    if (status() !== "complete") {
      setStatus("idle");
    }
  }

  function retry(): void {
    abort();
    retryCount = 0;
    connect();
  }

  // Start immediately
  connect();

  // Cleanup when the owning scope is disposed
  onCleanup(() => {
    abort();
  });

  return {
    slots,
    status,
    error,
    completedCount,
    totalCount,
    abort,
    retry,
  };
}
