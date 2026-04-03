// ── Component Streaming Utilities ─────────────────────────────────
// Streams AI-generated component trees as typed events.
// Each chunk is validated against the ComponentSchema before emission.
// Consumers get an AsyncIterable of strongly-typed events.

import { streamObject } from "ai";
import { z } from "zod";
import { ComponentSchema, type Component } from "@back-to-the-future/schemas";
import { getModelForTier, getDefaultModel, type AIProviderEnv } from "../providers";
import type { ComputeTier } from "../compute-tier";

// ── Stream Event Types ───────────────────────────────────────────

/**
 * Fired when the AI begins generating a new component in the tree.
 * Includes the component type and a unique ID for tracking.
 */
export interface ComponentStartEvent {
  type: "component-start";
  id: string;
  componentType: string;
  timestamp: number;
}

/**
 * Fired as partial data arrives for a component being generated.
 * The `partial` field contains the incomplete component JSON so far.
 */
export interface ComponentUpdateEvent {
  type: "component-update";
  id: string;
  partial: Record<string, unknown>;
  timestamp: number;
}

/**
 * Fired when a component has been fully generated and validated.
 * The `component` field contains the Zod-validated component.
 */
export interface ComponentCompleteEvent {
  type: "component-complete";
  id: string;
  component: Component;
  timestamp: number;
}

/**
 * Fired when an error occurs during generation or validation.
 */
export interface ComponentErrorEvent {
  type: "component-error";
  id: string;
  error: string;
  timestamp: number;
}

/**
 * Fired when the entire stream is complete (all components generated).
 */
export interface StreamDoneEvent {
  type: "stream-done";
  totalComponents: number;
  timestamp: number;
}

export type ComponentStreamEvent =
  | ComponentStartEvent
  | ComponentUpdateEvent
  | ComponentCompleteEvent
  | ComponentErrorEvent
  | StreamDoneEvent;

// ── Configuration ────────────────────────────────────────────────

export interface ComponentStreamConfig {
  computeTier?: ComputeTier;
  providerEnv?: AIProviderEnv;
  temperature?: number;
  maxComponents?: number;
}

// ── Schema for streaming output ──────────────────────────────────

const StreamingUISchema = z.object({
  components: z
    .array(ComponentSchema)
    .describe("The list of UI components to render"),
});

type StreamingUIOutput = z.infer<typeof StreamingUISchema>;

// ── System Prompt ────────────────────────────────────────────────

const COMPONENT_STREAM_SYSTEM_PROMPT = `You are a UI generation engine for the Back to the Future platform. You generate UI component trees from natural language descriptions.

## Available Components
Button, Input, Card, Stack, Text, Modal, Badge, Alert, Avatar, Tabs, Select, Textarea, Spinner, Tooltip, Separator, Timeline, ExhibitViewer, ChainOfCustody.

## Rules
1. Output ONLY valid component objects matching the schema.
2. Use Stack for layout composition with children.
3. Use Card for content grouping with children.
4. Use Text with appropriate variants for headings (h1, h2, h3) and content (body, caption).
5. Compose a clean, hierarchical component tree.
6. Never output raw HTML. Only use the component catalog.
`;

// ── Unique ID Generator ──────────────────────────────────────────

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `comp_${Date.now()}_${idCounter}`;
}

// ── Stream Components ────────────────────────────────────────────

/**
 * Streams AI-generated components as an async iterable of typed events.
 *
 * Uses Vercel AI SDK `streamObject` to progressively generate a component
 * array. As each component is detected in the partial output, it emits
 * start/update/complete events. Each completed component is validated
 * against the Zod ComponentSchema.
 *
 * @param prompt - Natural language description of the desired UI
 * @param config - Optional configuration for compute tier, provider, etc.
 * @returns AsyncIterable of ComponentStreamEvent
 */
export async function* streamComponents(
  prompt: string,
  config?: ComponentStreamConfig,
): AsyncGenerator<ComponentStreamEvent> {
  const computeTier = config?.computeTier ?? "cloud";
  const temperature = config?.temperature ?? 0.7;

  const model = config?.providerEnv
    ? getModelForTier(computeTier, config.providerEnv)
    : getDefaultModel();

  const maxComponents = config?.maxComponents ?? 20;

  const result = streamObject({
    model,
    schema: StreamingUISchema,
    prompt: `Generate a UI layout for the following request. Use ${maxComponents} components maximum.\n\nRequest: ${prompt}`,
    system: COMPONENT_STREAM_SYSTEM_PROMPT,
    temperature,
  });

  // Track which components we have already emitted events for
  const emittedIds: Map<number, string> = new Map();
  const completedIndices: Set<number> = new Set();

  for await (const partialObject of result.partialObjectStream) {
    const partial = partialObject as Partial<StreamingUIOutput>;
    const components = partial.components;

    if (!Array.isArray(components)) {
      continue;
    }

    for (let i = 0; i < components.length; i++) {
      const comp = components[i] as Record<string, unknown> | undefined;
      if (!comp) continue;

      // New component detected -- emit start event
      if (!emittedIds.has(i)) {
        const id = nextId();
        emittedIds.set(i, id);

        const componentType =
          typeof comp.component === "string" ? comp.component : "unknown";

        yield {
          type: "component-start",
          id,
          componentType,
          timestamp: Date.now(),
        };
      }

      const id = emittedIds.get(i) as string;

      // Already completed -- skip
      if (completedIndices.has(i)) {
        continue;
      }

      // Try to validate the component. If valid, it is complete.
      const parseResult = ComponentSchema.safeParse(comp);

      if (parseResult.success) {
        completedIndices.add(i);
        yield {
          type: "component-complete",
          id,
          component: parseResult.data as Component,
          timestamp: Date.now(),
        };
      } else {
        // Not yet valid -- emit partial update
        yield {
          type: "component-update",
          id,
          partial: comp,
          timestamp: Date.now(),
        };
      }
    }

  }

  // Check for any components that were started but never completed
  for (const [index, id] of emittedIds.entries()) {
    if (!completedIndices.has(index)) {
      yield {
        type: "component-error",
        id,
        error: "Component generation incomplete -- stream ended before validation passed",
        timestamp: Date.now(),
      };
    }
  }

  yield {
    type: "stream-done",
    totalComponents: completedIndices.size,
    timestamp: Date.now(),
  };
}
