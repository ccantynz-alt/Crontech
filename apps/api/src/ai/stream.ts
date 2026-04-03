// ── Generative UI Streaming Handler (Hono SSE) ──────────────────
// Server-side handler that streams AI-generated component trees
// to clients via Server-Sent Events. Each component is streamed
// progressively as it is generated, validated against Zod schemas,
// and emitted with typed SSE events.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  streamComponents,
  type ComponentStreamEvent,
  type ComponentStreamConfig,
} from "@back-to-the-future/ai-core/streaming";
import type { ComputeTier } from "@back-to-the-future/ai-core";

// ── Input Validation ─────────────────────────────────────────────

const StreamUIInputSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(10000),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxComponents: z.number().int().min(1).max(50).default(20),
});

export type StreamUIInput = z.infer<typeof StreamUIInputSchema>;

// ── SSE Event Formatting ─────────────────────────────────────────

/**
 * Maps a ComponentStreamEvent to the SSE event name used on the wire.
 * Clients subscribe to these event types via EventSource.
 */
function sseEventName(event: ComponentStreamEvent): string {
  return event.type;
}

// ── Route Definition ─────────────────────────────────────────────

export const streamUIRoutes = new Hono();

/**
 * POST /ai/stream-ui
 *
 * Accepts a prompt and streams back a component tree via SSE.
 * Each event carries a typed JSON payload:
 *
 *   event: component-start
 *   data: { "type": "component-start", "id": "comp_...", "componentType": "Card", "timestamp": ... }
 *
 *   event: component-update
 *   data: { "type": "component-update", "id": "comp_...", "partial": { ... }, "timestamp": ... }
 *
 *   event: component-complete
 *   data: { "type": "component-complete", "id": "comp_...", "component": { ... }, "timestamp": ... }
 *
 *   event: component-error
 *   data: { "type": "component-error", "id": "comp_...", "error": "...", "timestamp": ... }
 *
 *   event: stream-done
 *   data: { "type": "stream-done", "totalComponents": N, "timestamp": ... }
 */
streamUIRoutes.post("/stream-ui", async (c) => {
  const body = await c.req.json();
  const parsed = StreamUIInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { prompt, computeTier, temperature, maxComponents } = parsed.data;

  const streamConfig: ComponentStreamConfig = {
    computeTier: computeTier as ComputeTier,
    temperature,
    maxComponents,
  };

  return streamSSE(
    c,
    async (stream) => {
      let eventId = 0;

      // Keep-alive: send a comment every 15 seconds to prevent proxy timeouts
      const keepAliveInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "keepalive",
            data: JSON.stringify({ type: "keepalive", timestamp: Date.now() }),
            id: String(eventId++),
          });
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15_000);

      try {
        for await (const event of streamComponents(prompt, streamConfig)) {
          await stream.writeSSE({
            event: sseEventName(event),
            data: JSON.stringify(event),
            id: String(eventId++),
          });

          // End the stream after the done event
          if (event.type === "stream-done") {
            break;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Stream generation failed";

        await stream.writeSSE({
          event: "component-error",
          data: JSON.stringify({
            type: "component-error",
            id: "stream",
            error: message,
            timestamp: Date.now(),
          }),
          id: String(eventId++),
        });

        await stream.writeSSE({
          event: "stream-done",
          data: JSON.stringify({
            type: "stream-done",
            totalComponents: 0,
            timestamp: Date.now(),
          }),
          id: String(eventId++),
        });
      } finally {
        clearInterval(keepAliveInterval);
      }
    },
    async (_error, stream) => {
      await stream.writeSSE({
        event: "component-error",
        data: JSON.stringify({
          type: "component-error",
          id: "stream",
          error: "Internal stream error",
          timestamp: Date.now(),
        }),
        id: String(Date.now()),
      });
    },
  );
});

/**
 * GET /ai/stream-ui/health
 * Health check for the streaming endpoint.
 */
streamUIRoutes.get("/stream-ui/health", (c) => {
  return c.json({
    status: "ok",
    endpoint: "stream-ui",
    timestamp: new Date().toISOString(),
  });
});

export default streamUIRoutes;
