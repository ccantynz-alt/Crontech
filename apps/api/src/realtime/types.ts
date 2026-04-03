import { z } from "zod";

// ── Constants ────────────────────────────────────────────────────────

/** Maximum size in bytes for a single WebSocket message (64 KB). */
export const WS_MAX_MESSAGE_SIZE = 64 * 1024;

/** Maximum rooms a single connection may join simultaneously. */
export const WS_MAX_ROOMS_PER_CONNECTION = 10;

/** Maximum users allowed in a single room. */
export const WS_MAX_USERS_PER_ROOM = 100;

/** Maximum SSE connections per room. */
export const SSE_MAX_SUBSCRIBERS_PER_ROOM = 200;

/** Maximum total SSE connections across all rooms. */
export const SSE_MAX_TOTAL_SUBSCRIBERS = 5_000;

/** Heartbeat timeout -- connection considered dead after this many ms without a ping. */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/** Interval between heartbeat sweeps on the server (ms). */
export const HEARTBEAT_CHECK_INTERVAL_MS = 10_000;

/** Keep-alive interval for SSE streams (ms). */
export const SSE_KEEPALIVE_INTERVAL_MS = 15_000;

/** SSE reconnect hint sent to clients (ms). */
export const SSE_RETRY_MS = 3_000;

// ── Rate Limiting ────────────────────────────────────────────────────

/** Maximum messages a client may send per window. */
export const WS_RATE_LIMIT_MAX = 60;

/** Rate limit sliding window in milliseconds. */
export const WS_RATE_LIMIT_WINDOW_MS = 10_000;

// ── Client -> Server Messages ────────────────────────────────────────

export const JoinRoomMessage = z.object({
  type: z.literal("join_room"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  metadata: z
    .object({
      displayName: z.string().max(100).optional(),
      color: z.string().max(20).optional(),
    })
    .optional(),
});

export const LeaveRoomMessage = z.object({
  type: z.literal("leave_room"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
});

export const BroadcastMessage = z.object({
  type: z.literal("broadcast"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export const CursorMoveMessage = z.object({
  type: z.literal("cursor_move"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  /** Optional element or viewport identifier the cursor is over. */
  target: z.string().max(255).optional(),
});

export const PresenceUpdateMessage = z.object({
  type: z.literal("presence_update"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  status: z.enum(["active", "idle", "away"]),
  data: z.record(z.unknown()).optional(),
});

export const PingMessage = z.object({
  type: z.literal("ping"),
});

export const ClientMessage = z.discriminatedUnion("type", [
  JoinRoomMessage,
  LeaveRoomMessage,
  BroadcastMessage,
  CursorMoveMessage,
  PresenceUpdateMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ── Server -> Client Messages ────────────────────────────────────────

export const RoomJoinedMessage = z.object({
  type: z.literal("room_joined"),
  roomId: z.string(),
  users: z.array(
    z.object({
      userId: z.string().uuid(),
      metadata: z
        .object({
          displayName: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      presence: z
        .object({
          status: z.enum(["active", "idle", "away"]),
          data: z.record(z.unknown()).optional(),
        })
        .optional(),
    }),
  ),
});

export const RoomLeftMessage = z.object({
  type: z.literal("room_left"),
  roomId: z.string(),
});

export const ServerBroadcastMessage = z.object({
  type: z.literal("broadcast"),
  roomId: z.string(),
  userId: z.string().uuid(),
  payload: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export const UserJoinedMessage = z.object({
  type: z.literal("user_joined"),
  roomId: z.string(),
  userId: z.string().uuid(),
  metadata: z
    .object({
      displayName: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
});

export const UserLeftMessage = z.object({
  type: z.literal("user_left"),
  roomId: z.string(),
  userId: z.string().uuid(),
});

export const CursorUpdateMessage = z.object({
  type: z.literal("cursor_update"),
  roomId: z.string(),
  userId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  target: z.string().optional(),
});

export const PresenceSyncMessage = z.object({
  type: z.literal("presence_sync"),
  roomId: z.string(),
  userId: z.string().uuid(),
  status: z.enum(["active", "idle", "away"]),
  data: z.record(z.unknown()).optional(),
});

export const ErrorCode = z.enum([
  "invalid_message",
  "room_not_found",
  "room_full",
  "unauthorized",
  "rate_limited",
  "message_too_large",
  "too_many_rooms",
  "internal_error",
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

export const ServerErrorMessage = z.object({
  type: z.literal("error"),
  code: ErrorCode,
  message: z.string(),
});

export const PongMessage = z.object({
  type: z.literal("pong"),
  timestamp: z.number().optional(),
});

export const ServerMessage = z.discriminatedUnion("type", [
  RoomJoinedMessage,
  RoomLeftMessage,
  ServerBroadcastMessage,
  UserJoinedMessage,
  UserLeftMessage,
  CursorUpdateMessage,
  PresenceSyncMessage,
  ServerErrorMessage,
  PongMessage,
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

// ── SSE Event Types ──────────────────────────────────────────────────

export const SSEEventType = z.enum([
  "update",
  "notification",
  "ai_response",
  "presence",
  "cursor",
  "keepalive",
  "error",
]);

export type SSEEventType = z.infer<typeof SSEEventType>;

export const SSEEvent = z.object({
  event: SSEEventType,
  data: z.record(z.unknown()),
  id: z.string().optional(),
});

export type SSEEvent = z.infer<typeof SSEEvent>;

// ── Shared Types ─────────────────────────────────────────────────────

export interface RoomUser {
  userId: string;
  ws: WebSocket;
  metadata:
    | {
        displayName?: string | undefined;
        color?: string | undefined;
      }
    | undefined;
  presence:
    | {
        status: "active" | "idle" | "away";
        data?: Record<string, unknown> | undefined;
      }
    | undefined;
  cursor:
    | {
        x: number;
        y: number;
        target?: string | undefined;
      }
    | undefined;
  lastPing: number;
  /** Number of rooms this user's connection has joined. */
  roomCount: number;
}

/** Sliding-window rate limiter state per connection. */
export interface RateLimitBucket {
  timestamps: number[];
}

/** SSE subscriber entry tracked by the room manager. */
export interface SSESubscriber {
  writer: WritableStreamDefaultWriter<string>;
  controller: AbortController;
  connectedAt: number;
}

// ── Connection Status (shared with client) ───────────────────────────

export const ConnectionStatus = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "reconnecting",
  "error",
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatus>;
