// ── AI Website Builder Routes (Hono + SSE) ───────────────────────
// API routes for the AI website builder agent.
// POST /build - Start a new build session (SSE streaming)
// POST /build/refine - Refine an existing build
// All inputs validated with Zod. All responses streamed via SSE.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { ModelMessage } from "ai";
import {
  readProviderEnv,
  streamWebsiteBuilder,
  buildWebsite,
  refineWebsite,
  type ComputeTier,
  type WebsiteBuilderConfig,
  type BuilderEvent,
} from "@back-to-the-future/ai-core";
import { ComponentSchema } from "@back-to-the-future/schemas";

// ── Input Schemas ───────────────────────────────────────────────

const BuildInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  maxTokens: z.number().int().min(1).max(16384).default(8192),
  temperature: z.number().min(0).max(2).default(0.6),
  mode: z
    .enum(["stream", "generate"])
    .default("stream")
    .describe("'stream' for multi-step tool calling SSE, 'generate' for event-based generation"),
});

const RefineInputSchema = z.object({
  components: z
    .array(ComponentSchema)
    .min(1, "At least one component is required"),
  message: z.string().min(1, "Refinement message is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  temperature: z.number().min(0).max(2).default(0.6),
});

// ── Route Definitions ───────────────────────────────────────────

export const builderRoutes = new Hono();

/**
 * POST /build
 * Start a build session. Supports two modes:
 * - "stream": Uses Vercel AI SDK streamText with multi-step tool calling.
 *   Returns an AI SDK text stream response (compatible with useChat on the client).
 * - "generate": Uses the async generator pipeline (intent -> plan -> generate -> assemble).
 *   Returns SSE events with fine-grained build progress.
 */
builderRoutes.post("/build", async (c) => {
  const body: unknown = await c.req.json();
  const parsed = BuildInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { messages, computeTier, maxTokens, temperature, mode } = parsed.data;
  const providerEnv = readProviderEnv();

  const builderConfig: WebsiteBuilderConfig = {
    computeTier: computeTier as ComputeTier,
    providerEnv,
    maxTokens,
    temperature,
    maxSteps: 10,
  };

  if (mode === "stream") {
    // Multi-step tool calling via Vercel AI SDK streamText
    const result = streamWebsiteBuilder(
      messages as ModelMessage[],
      builderConfig,
    );

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Event-based generation mode: SSE with BuilderEvents
  const lastMessage = messages[messages.length - 1];
  const userMessage = lastMessage?.content ?? "";

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    try {
      for await (const event of buildWebsite(userMessage, builderConfig)) {
        eventId += 1;
        await stream.writeSSE({
          id: String(eventId),
          event: event.type,
          data: JSON.stringify(event),
        });
      }
    } catch (err) {
      eventId += 1;
      const errorEvent: BuilderEvent = {
        type: "error",
        message: err instanceof Error ? err.message : "Build failed unexpectedly",
      };
      await stream.writeSSE({
        id: String(eventId),
        event: "error",
        data: JSON.stringify(errorEvent),
      });
    }
  });
});

/**
 * POST /build/refine
 * Refine an existing build based on user feedback.
 * Takes the current component tree and a refinement instruction.
 * Returns the updated component tree as JSON.
 */
builderRoutes.post("/build/refine", async (c) => {
  const body: unknown = await c.req.json();
  const parsed = RefineInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { components, message, computeTier, temperature } = parsed.data;
  const providerEnv = readProviderEnv();

  const builderConfig: WebsiteBuilderConfig = {
    computeTier: computeTier as ComputeTier,
    providerEnv,
    temperature,
  };

  try {
    const result = await refineWebsite(components, message, builderConfig);
    return c.json({
      success: true,
      title: result.title,
      description: result.description,
      components: result.components,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Refinement failed";
    return c.json({ error: errorMessage }, 500);
  }
});

export default builderRoutes;
