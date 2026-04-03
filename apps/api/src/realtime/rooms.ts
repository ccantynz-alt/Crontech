import type { RoomUser, ServerMessage, SSESubscriber, RateLimitBucket } from "./types";
import {
  WS_MAX_USERS_PER_ROOM,
  WS_MAX_ROOMS_PER_CONNECTION,
  SSE_MAX_SUBSCRIBERS_PER_ROOM,
  SSE_MAX_TOTAL_SUBSCRIBERS,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_CHECK_INTERVAL_MS,
  WS_RATE_LIMIT_MAX,
  WS_RATE_LIMIT_WINDOW_MS,
} from "./types";

/**
 * In-memory room manager for real-time collaboration.
 *
 * This is an in-process implementation suitable for single-server deployments
 * and development. Production deployments will replace this with Cloudflare
 * Durable Objects for globally distributed, persistent room state.
 *
 * Hardened with:
 * - Per-connection rate limiting (sliding window)
 * - Room capacity enforcement
 * - Per-connection room count limits
 * - SSE connection pool limits with backpressure
 * - Dead connection sweeping via heartbeat
 */
export class RoomManager {
  /** roomId -> Map<userId, RoomUser> */
  private rooms: Map<string, Map<string, RoomUser>> = new Map();

  /** SSE subscribers: roomId -> Set<SSESubscriber> */
  private sseSubscribers: Map<string, Set<SSESubscriber>> = new Map();

  /** Per-connection rate limit buckets keyed by userId. */
  private rateLimitBuckets: Map<string, RateLimitBucket> = new Map();

  /** Total active SSE subscribers across all rooms. */
  private totalSSESubscribers = 0;

  /** Heartbeat check interval handle. */
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeatCheck();
  }

  // ── Rate Limiting ─────────────────────────────────────────────────

  /**
   * Check whether a user is within their rate limit.
   * Returns `true` if the message is allowed, `false` if rate-limited.
   */
  checkRateLimit(userId: string): boolean {
    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(userId);

    if (!bucket) {
      bucket = { timestamps: [] };
      this.rateLimitBuckets.set(userId, bucket);
    }

    // Evict timestamps outside the sliding window
    const windowStart = now - WS_RATE_LIMIT_WINDOW_MS;
    bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

    if (bucket.timestamps.length >= WS_RATE_LIMIT_MAX) {
      return false;
    }

    bucket.timestamps.push(now);
    return true;
  }

  // ── Room Join / Leave ─────────────────────────────────────────────

  joinRoom(
    roomId: string,
    userId: string,
    ws: WebSocket,
    metadata?: RoomUser["metadata"],
  ): { success: boolean; error?: string | undefined } {
    // Enforce per-connection room limit
    const currentRoomCount = this.getUserRoomCount(userId);
    if (currentRoomCount >= WS_MAX_ROOMS_PER_CONNECTION) {
      return {
        success: false,
        error: `Cannot join more than ${WS_MAX_ROOMS_PER_CONNECTION} rooms simultaneously`,
      };
    }

    let room = this.rooms.get(roomId);

    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }

    // Allow rejoining the same room (replaces connection)
    const existing = room.get(userId);
    if (!existing && room.size >= WS_MAX_USERS_PER_ROOM) {
      return { success: false, error: "Room is full" };
    }

    // If user already in room with a different WS, close the old one
    if (existing) {
      try {
        existing.ws.close(1000, "Replaced by new connection");
      } catch {
        // Connection may already be closed
      }
    }

    const user: RoomUser = {
      userId,
      ws,
      metadata,
      presence: { status: "active" },
      cursor: undefined,
      lastPing: Date.now(),
      roomCount: currentRoomCount + (existing ? 0 : 1),
    };

    room.set(userId, user);

    // Notify other users in the room
    this.broadcast(
      roomId,
      {
        type: "user_joined",
        roomId,
        userId,
        metadata,
      },
      userId,
    );

    // Send current room state to the joining user
    const users = Array.from(room.values()).map((u) => ({
      userId: u.userId,
      metadata: u.metadata,
      presence: u.presence,
    }));

    this.sendToUser(roomId, userId, {
      type: "room_joined",
      roomId,
      users,
    });

    return { success: true };
  }

  leaveRoom(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    room.delete(userId);

    // Decrement room count across all remaining entries for this user
    if (user) {
      this.decrementUserRoomCount(userId);
    }

    // Notify remaining users
    this.broadcast(roomId, {
      type: "user_left",
      roomId,
      userId,
    });

    // Clean up empty rooms
    if (room.size === 0) {
      this.rooms.delete(roomId);
      this.cleanupSSESubscribers(roomId);
    }
  }

  /**
   * Remove a user from ALL rooms they belong to.
   * Called on WebSocket disconnect.
   */
  removeUserFromAllRooms(userId: string): void {
    for (const [roomId, room] of this.rooms) {
      if (room.has(userId)) {
        this.leaveRoom(roomId, userId);
      }
    }
    // Clean up rate limit bucket
    this.rateLimitBuckets.delete(userId);
  }

  // ── Broadcasting ──────────────────────────────────────────────────

  broadcast(
    roomId: string,
    message: ServerMessage,
    excludeUserId?: string,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const data = JSON.stringify(message);

    for (const [uid, user] of room) {
      if (uid === excludeUserId) continue;
      try {
        if (user.ws.readyState === WebSocket.OPEN) {
          user.ws.send(data);
        }
      } catch {
        // Connection broken -- will be cleaned up by heartbeat
      }
    }

    // Also push to SSE subscribers
    this.pushToSSESubscribers(roomId, message);
  }

  // ── Queries ───────────────────────────────────────────────────────

  getRoomUsers(
    roomId: string,
  ): Array<{
    userId: string;
    metadata?: RoomUser["metadata"];
    presence?: RoomUser["presence"];
    cursor?: RoomUser["cursor"];
  }> {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.values()).map((u) => ({
      userId: u.userId,
      metadata: u.metadata,
      presence: u.presence,
      cursor: u.cursor,
    }));
  }

  // ── Presence & Cursors ────────────────────────────────────────────

  updatePresence(
    roomId: string,
    userId: string,
    status: "active" | "idle" | "away",
    data?: Record<string, unknown>,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    if (!user) return;

    user.presence = data !== undefined ? { status, data } : { status };

    this.broadcast(
      roomId,
      {
        type: "presence_sync",
        roomId,
        userId,
        status,
        ...(data !== undefined ? { data } : {}),
      },
      userId,
    );
  }

  updateCursor(
    roomId: string,
    userId: string,
    x: number,
    y: number,
    target?: string,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    if (!user) return;

    user.cursor = target !== undefined ? { x, y, target } : { x, y };

    this.broadcast(
      roomId,
      {
        type: "cursor_update",
        roomId,
        userId,
        x,
        y,
        ...(target !== undefined ? { target } : {}),
      },
      userId,
    );
  }

  /**
   * Record that we received a ping from a user, keeping them alive.
   */
  recordPing(userId: string): void {
    for (const room of this.rooms.values()) {
      const user = room.get(userId);
      if (user) {
        user.lastPing = Date.now();
      }
    }
  }

  sendToUser(roomId: string, userId: string, message: ServerMessage): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    if (!user) return;

    try {
      if (user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(message));
      }
    } catch {
      // Connection broken
    }
  }

  // ── SSE Subscriber Management ─────────────────────────────────────

  addSSESubscriber(
    roomId: string,
    writer: WritableStreamDefaultWriter<string>,
    controller: AbortController,
  ): { success: boolean; error?: string | undefined } {
    // Enforce global SSE pool limit
    if (this.totalSSESubscribers >= SSE_MAX_TOTAL_SUBSCRIBERS) {
      return {
        success: false,
        error: "Server SSE connection pool exhausted",
      };
    }

    let subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers) {
      subscribers = new Set();
      this.sseSubscribers.set(roomId, subscribers);
    }

    // Enforce per-room SSE limit
    if (subscribers.size >= SSE_MAX_SUBSCRIBERS_PER_ROOM) {
      return {
        success: false,
        error: "Room SSE subscriber limit reached",
      };
    }

    const sub: SSESubscriber = {
      writer,
      controller,
      connectedAt: Date.now(),
    };
    subscribers.add(sub);
    this.totalSSESubscribers++;

    return { success: true };
  }

  removeSSESubscriber(
    roomId: string,
    writer: WritableStreamDefaultWriter<string>,
  ): void {
    const subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers) return;

    for (const sub of subscribers) {
      if (sub.writer === writer) {
        subscribers.delete(sub);
        this.totalSSESubscribers = Math.max(0, this.totalSSESubscribers - 1);
        break;
      }
    }

    if (subscribers.size === 0) {
      this.sseSubscribers.delete(roomId);
    }
  }

  /**
   * Push a server message to all SSE subscribers of a room.
   * Handles backpressure by dropping messages to slow subscribers
   * rather than blocking the entire broadcast.
   */
  private pushToSSESubscribers(roomId: string, message: ServerMessage): void {
    const subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers || subscribers.size === 0) return;

    const eventType = this.serverMessageToSSEEvent(message.type);
    const ssePayload = `event: ${eventType}\ndata: ${JSON.stringify(message)}\nid: ${Date.now()}\n\n`;

    const deadSubscribers: SSESubscriber[] = [];

    for (const sub of subscribers) {
      try {
        // Use write() but do not await -- fire-and-forget for backpressure.
        // If the writer's internal buffer is full, the promise rejects
        // and we mark the subscriber as dead.
        void sub.writer.write(ssePayload).catch(() => {
          deadSubscribers.push(sub);
        });
      } catch {
        deadSubscribers.push(sub);
      }
    }

    // Cleanup dead subscribers asynchronously
    if (deadSubscribers.length > 0) {
      for (const dead of deadSubscribers) {
        subscribers.delete(dead);
        this.totalSSESubscribers = Math.max(0, this.totalSSESubscribers - 1);
        try {
          dead.controller.abort();
        } catch {
          // Already aborted
        }
      }
    }
  }

  private serverMessageToSSEEvent(type: ServerMessage["type"]): string {
    switch (type) {
      case "cursor_update":
        return "cursor";
      case "presence_sync":
        return "presence";
      case "broadcast":
      case "user_joined":
      case "user_left":
      case "room_joined":
      case "room_left":
      case "pong":
        return "update";
      case "error":
        return "notification";
      default:
        return "update";
    }
  }

  private cleanupSSESubscribers(roomId: string): void {
    const subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers) return;

    for (const sub of subscribers) {
      this.totalSSESubscribers = Math.max(0, this.totalSSESubscribers - 1);
      try {
        sub.controller.abort();
        void sub.writer.close();
      } catch {
        // Already closed
      }
    }
    this.sseSubscribers.delete(roomId);
  }

  // ── Heartbeat / Dead Connection Cleanup ───────────────────────────

  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const deadUsers: Array<{ roomId: string; userId: string }> = [];

      for (const [roomId, room] of this.rooms) {
        for (const [userId, user] of room) {
          const elapsed = now - user.lastPing;
          if (elapsed > HEARTBEAT_TIMEOUT_MS) {
            deadUsers.push({ roomId, userId });
          }
        }
      }

      for (const { roomId, userId } of deadUsers) {
        const room = this.rooms.get(roomId);
        const user = room?.get(userId);
        if (user) {
          try {
            user.ws.close(1001, "Heartbeat timeout");
          } catch {
            // Already closed
          }
        }
        this.leaveRoom(roomId, userId);
      }

      // Periodically prune stale rate limit buckets
      const windowStart = now - WS_RATE_LIMIT_WINDOW_MS;
      for (const [userId, bucket] of this.rateLimitBuckets) {
        bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
        if (bucket.timestamps.length === 0) {
          this.rateLimitBuckets.delete(userId);
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  /**
   * Graceful shutdown: close all connections and stop the heartbeat loop.
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [_roomId, room] of this.rooms) {
      for (const user of room.values()) {
        try {
          user.ws.close(1001, "Server shutting down");
        } catch {
          // Already closed
        }
      }
    }
    this.rooms.clear();

    for (const [roomId] of this.sseSubscribers) {
      this.cleanupSSESubscribers(roomId);
    }
    this.sseSubscribers.clear();
    this.rateLimitBuckets.clear();
    this.totalSSESubscribers = 0;
  }

  // ── Stats ─────────────────────────────────────────────────────────

  getRoomCount(): number {
    return this.rooms.size;
  }

  getTotalUserCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.size;
    }
    return count;
  }

  getTotalSSESubscriberCount(): number {
    return this.totalSSESubscribers;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private getUserRoomCount(userId: string): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.has(userId)) {
        count++;
      }
    }
    return count;
  }

  private decrementUserRoomCount(userId: string): void {
    for (const room of this.rooms.values()) {
      const user = room.get(userId);
      if (user && user.roomCount > 0) {
        user.roomCount--;
      }
    }
  }
}

/** Singleton room manager instance. */
export const roomManager = new RoomManager();
