import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { ClientMessage, WS_MAX_MESSAGE_SIZE } from "./types";
import type { ErrorCode } from "./types";
import { roomManager } from "./rooms";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

/**
 * WebSocket route handler for real-time bidirectional communication.
 *
 * Hardened with:
 * - Zod validation on every incoming message
 * - Per-connection sliding-window rate limiting
 * - Message size enforcement
 * - Ping/pong heartbeat with server-side timestamping
 * - Graceful cleanup on disconnect and error
 * - Typed error codes for every rejection reason
 */
const wsApp = new Hono();

/** Track which userId owns each WebSocket so we can clean up on close. */
const wsUserMap = new WeakMap<WebSocket, string>();

wsApp.get(
  "/ws",
  upgradeWebSocket(() => {
    return {
      onOpen(_event, ws) {
        // Connection opened. User must send join_room to participate.
        // Send an initial pong to confirm the connection is alive.
        const raw = ws.raw as unknown as WebSocket;
        trySend(raw, { type: "pong", timestamp: Date.now() });
      },

      onMessage(event, ws) {
        const raw = ws.raw as unknown as WebSocket;

        // ── Message size check ──────────────────────────────────
        const rawData =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);

        if (rawData.length > WS_MAX_MESSAGE_SIZE) {
          sendError(
            raw,
            "message_too_large",
            `Message exceeds maximum size of ${WS_MAX_MESSAGE_SIZE} bytes`,
          );
          return;
        }

        // ── JSON parse ──────────────────────────────────────────
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawData);
        } catch {
          sendError(raw, "invalid_message", "Malformed JSON");
          return;
        }

        // ── Schema validation ───────────────────────────────────
        const result = ClientMessage.safeParse(parsed);
        if (!result.success) {
          sendError(
            raw,
            "invalid_message",
            `Invalid message: ${result.error.issues.map((i) => i.message).join(", ")}`,
          );
          return;
        }

        // ── Rate limiting ───────────────────────────────────────
        const userId = wsUserMap.get(raw);
        const messageUserId = extractUserId(result.data);
        const effectiveUserId = userId ?? messageUserId;

        if (effectiveUserId && !roomManager.checkRateLimit(effectiveUserId)) {
          sendError(
            raw,
            "rate_limited",
            "Too many messages. Please slow down.",
          );
          return;
        }

        handleClientMessage(raw, result.data);
      },

      onClose(_event, ws) {
        const raw = ws.raw as unknown as WebSocket;
        cleanupConnection(raw);
      },

      onError(_event, ws) {
        const raw = ws.raw as unknown as WebSocket;
        cleanupConnection(raw);
      },
    };
  }),
);

// ── Message Handling ──────────────────────────────────────────────────

function handleClientMessage(ws: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case "join_room": {
      wsUserMap.set(ws, message.userId);

      const result = roomManager.joinRoom(
        message.roomId,
        message.userId,
        ws,
        message.metadata,
      );

      if (!result.success) {
        const code: ErrorCode =
          result.error?.includes("full") === true
            ? "room_full"
            : result.error?.includes("more than") === true
              ? "too_many_rooms"
              : "room_not_found";
        sendError(ws, code, result.error ?? "Failed to join room");
      }
      break;
    }

    case "leave_room": {
      roomManager.leaveRoom(message.roomId, message.userId);
      trySend(ws, {
        type: "room_left",
        roomId: message.roomId,
      });
      break;
    }

    case "broadcast": {
      roomManager.broadcast(
        message.roomId,
        {
          type: "broadcast",
          roomId: message.roomId,
          userId: message.userId,
          payload: message.payload,
          timestamp: new Date().toISOString(),
        },
        message.userId,
      );
      break;
    }

    case "cursor_move": {
      roomManager.updateCursor(
        message.roomId,
        message.userId,
        message.x,
        message.y,
        message.target,
      );
      break;
    }

    case "presence_update": {
      roomManager.updatePresence(
        message.roomId,
        message.userId,
        message.status,
        message.data,
      );
      break;
    }

    case "ping": {
      const userId = wsUserMap.get(ws);
      if (userId) {
        roomManager.recordPing(userId);
      }
      trySend(ws, { type: "pong", timestamp: Date.now() });
      break;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function cleanupConnection(ws: WebSocket): void {
  const userId = wsUserMap.get(ws);
  if (userId) {
    roomManager.removeUserFromAllRooms(userId);
    wsUserMap.delete(ws);
  }
}

function extractUserId(message: ClientMessage): string | undefined {
  if ("userId" in message) {
    return message.userId;
  }
  return undefined;
}

/**
 * Attempt to send a JSON payload to a WebSocket.
 * Silently catches errors from closed connections.
 */
function trySend(ws: WebSocket, data: Record<string, unknown>): void {
  try {
    ws.send(JSON.stringify(data));
  } catch {
    // Connection already closed
  }
}

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  trySend(ws, {
    type: "error",
    code,
    message,
  });
}

export { wsApp, websocket };
