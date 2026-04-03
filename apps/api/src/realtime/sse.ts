import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { roomManager } from "./rooms";
import { SSE_KEEPALIVE_INTERVAL_MS, SSE_RETRY_MS } from "./types";

/**
 * Server-Sent Events route for server-to-client streaming.
 *
 * Hardened with:
 * - Connection pool limits enforced via RoomManager
 * - Backpressure handling (slow clients are disconnected gracefully)
 * - Retry header sent on initial connection so clients auto-reconnect
 * - Event type routing with typed SSE event names
 * - Keep-alive pings to prevent proxy/load-balancer timeouts
 * - Proper cleanup on disconnect, error, and abort
 *
 * SSE is used as an alternative to WebSockets for:
 * - AI response streaming
 * - Live update notifications
 * - Presence/cursor updates for read-only observers
 *
 * Clients that only need to receive (not send) should prefer SSE.
 * It works through HTTP/2, proxies, and load balancers without upgrade negotiation.
 */
const sseApp = new Hono();

const RoomIdParam = z.string().min(1).max(255);

sseApp.get("/realtime/events/:roomId", async (c) => {
  const roomIdResult = RoomIdParam.safeParse(c.req.param("roomId"));
  if (!roomIdResult.success) {
    return c.json({ error: "Invalid room ID" }, 400);
  }

  const roomId = roomIdResult.data;

  // Accept an optional Last-Event-ID header for resumption.
  // The in-memory implementation does not replay missed events.
  // Production Durable Objects will use this to replay from the
  // last acknowledged event ID.
  // eslint-disable-next-line -- reserved for production replay logic
  void c.req.header("Last-Event-ID");

  return streamSSE(
    c,
    async (stream) => {
      // Create a TransformStream to bridge RoomManager push -> SSE stream.
      const { readable, writable } = new TransformStream<string, string>();
      const writer = writable.getWriter();
      const controller = new AbortController();

      // Register this SSE connection with the room manager (enforces pool limits).
      const subscribeResult = roomManager.addSSESubscriber(
        roomId,
        writer,
        controller,
      );

      if (!subscribeResult.success) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            code: "rate_limited",
            message:
              subscribeResult.error ?? "SSE connection limit reached",
          }),
          id: String(Date.now()),
        });
        return;
      }

      // Send retry hint so the browser's EventSource will auto-reconnect
      // at the desired interval if the connection drops.
      await stream.writeSSE({
        event: "update",
        data: JSON.stringify({
          type: "connected",
          roomId,
          users: roomManager.getRoomUsers(roomId),
          timestamp: new Date().toISOString(),
        }),
        id: String(Date.now()),
        retry: SSE_RETRY_MS,
      });

      // Keep-alive: send a ping event periodically to prevent proxy timeouts.
      const keepAliveInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "keepalive",
            data: JSON.stringify({ type: "keepalive", timestamp: Date.now() }),
            id: String(Date.now()),
          });
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, SSE_KEEPALIVE_INTERVAL_MS);

      // Abort the reader when the controller fires (e.g. room cleanup).
      controller.signal.addEventListener("abort", () => {
        clearInterval(keepAliveInterval);
        reader.cancel().catch(() => {
          // Already cancelled
        });
      });

      // Read from the transform stream and forward to SSE.
      const reader = readable.getReader();
      try {
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          // The value is already formatted as SSE by RoomManager.pushToSSESubscribers
          await stream.write(value);
        }
      } catch {
        // Stream closed (client disconnected or abort)
      } finally {
        clearInterval(keepAliveInterval);
        roomManager.removeSSESubscriber(roomId, writer);
        reader.releaseLock();
        try {
          await writer.close();
        } catch {
          // Already closed
        }
      }
    },
    async (_error, stream) => {
      // Error handler: notify client and close gracefully.
      try {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            code: "internal_error",
            message: "Stream encountered an error",
          }),
          id: String(Date.now()),
        });
      } catch {
        // Stream already closed
      }
    },
  );
});

/**
 * GET /realtime/rooms/:roomId/users
 * Quick REST endpoint to check who is in a room without subscribing.
 */
sseApp.get("/realtime/rooms/:roomId/users", (c) => {
  const roomIdResult = RoomIdParam.safeParse(c.req.param("roomId"));
  if (!roomIdResult.success) {
    return c.json({ error: "Invalid room ID" }, 400);
  }

  const users = roomManager.getRoomUsers(roomIdResult.data);
  return c.json({ roomId: roomIdResult.data, users, count: users.length });
});

/**
 * GET /realtime/stats
 * Server stats: active rooms, connected users, SSE subscribers.
 */
sseApp.get("/realtime/stats", (c) => {
  return c.json({
    rooms: roomManager.getRoomCount(),
    users: roomManager.getTotalUserCount(),
    sseSubscribers: roomManager.getTotalSSESubscriberCount(),
    timestamp: new Date().toISOString(),
  });
});

export { sseApp };
