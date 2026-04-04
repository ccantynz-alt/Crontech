import { z } from "zod";

// ── Zod Schemas ─────────────────────────────────────────────────────────

export const AuditActionSchema = z.enum([
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "SIGN",
  "LOGIN",
  "LOGOUT",
  "APPROVE",
  "REJECT",
  "EXECUTE",
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditActorSchema = z.object({
  /** Authenticated user ID */
  userId: z.string(),
  /** Display name */
  displayName: z.string().optional(),
  /** Role at time of action */
  role: z.string().optional(),
  /** Source IP address */
  ip: z.string().optional(),
  /** User agent string */
  userAgent: z.string().optional(),
});

export type AuditActor = z.infer<typeof AuditActorSchema>;

export const AuditResourceSchema = z.object({
  /** Resource type (e.g., "document", "user", "agent") */
  type: z.string(),
  /** Resource identifier */
  id: z.string(),
});

export type AuditResource = z.infer<typeof AuditResourceSchema>;

export const AuditDetailSchema = z.record(z.unknown()).optional();

export type AuditDetail = z.infer<typeof AuditDetailSchema>;

export const AuditEventInputSchema = z.object({
  /** Standardized action verb */
  action: AuditActionSchema,
  /** Who performed the action */
  actor: AuditActorSchema,
  /** What resource was affected */
  resource: AuditResourceSchema,
  /** Additional details (fields changed, before/after values) */
  detail: AuditDetailSchema,
  /** Result of the action */
  result: z.enum(["success", "failure"]).default("success"),
  /** Error code if result is failure */
  errorCode: z.string().optional(),
  /** Session ID linking to auth session */
  sessionId: z.string().optional(),
});

export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;

export const AuditEventSchema = z.object({
  /** UUID v4 event identifier */
  eventId: z.string().uuid(),
  /** RFC 3339 timestamp */
  timestamp: z.string(),
  /** Standardized action verb */
  action: AuditActionSchema,
  /** Who performed the action */
  actor: AuditActorSchema,
  /** What resource was affected */
  resource: AuditResourceSchema,
  /** Additional details */
  detail: AuditDetailSchema,
  /** Result of the action */
  result: z.enum(["success", "failure"]),
  /** Error code if result is failure */
  errorCode: z.string().optional(),
  /** Session ID */
  sessionId: z.string().optional(),
  /** SHA-256 hash of the previous entry */
  previousHash: z.string(),
  /** SHA-256 hash of this entry (all fields except entryHash) */
  entryHash: z.string(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditFilterSchema = z.object({
  /** Filter by action type */
  action: AuditActionSchema.optional(),
  /** Filter by actor user ID */
  actorUserId: z.string().optional(),
  /** Filter by resource type */
  resourceType: z.string().optional(),
  /** Filter by resource ID */
  resourceId: z.string().optional(),
  /** Filter by session ID */
  sessionId: z.string().optional(),
  /** Filter events after this timestamp (ISO 8601) */
  after: z.string().optional(),
  /** Filter events before this timestamp (ISO 8601) */
  before: z.string().optional(),
  /** Maximum number of events to return */
  limit: z.number().int().positive().default(100),
  /** Offset for pagination */
  offset: z.number().int().min(0).default(0),
});

export type AuditFilter = z.input<typeof AuditFilterSchema>;

// ── SHA-256 Hashing ────────────────────────────────────────────────────

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── UUID v4 Generation ─────────────────────────────────────────────────

function generateUUID(): string {
  return crypto.randomUUID();
}

// ── Audit Trail ────────────────────────────────────────────────────────

export class AuditTrail {
  private readonly events: AuditEvent[] = [];
  private lastHash: string = "0".repeat(64); // Genesis hash

  /**
   * Log an audit event. Each event is hash-chained to the previous entry.
   * Uses SHA-256 via Web Crypto API for cryptographic integrity.
   */
  async log(input: AuditEventInput): Promise<AuditEvent> {
    const validated = AuditEventInputSchema.parse(input);

    const eventId = generateUUID();
    const timestamp = new Date().toISOString();
    const previousHash = this.lastHash;

    // Build the event without entryHash first (for hashing)
    const eventData = {
      eventId,
      timestamp,
      action: validated.action,
      actor: validated.actor,
      resource: validated.resource,
      detail: validated.detail,
      result: validated.result,
      errorCode: validated.errorCode,
      sessionId: validated.sessionId,
      previousHash,
    };

    // Compute hash of all fields
    const hashInput = JSON.stringify(eventData, Object.keys(eventData).sort());
    const entryHash = await sha256(hashInput);

    const event: AuditEvent = {
      ...eventData,
      entryHash,
    };

    // Append to log (append-only -- never modify or delete)
    this.events.push(event);
    this.lastHash = entryHash;

    return event;
  }

  /**
   * Retrieve audit events matching the given filter criteria.
   */
  getEvents(filter?: AuditFilter): AuditEvent[] {
    const parsed = filter ? AuditFilterSchema.parse(filter) : { limit: 100, offset: 0 };

    let filtered = [...this.events];

    if (parsed.action) {
      filtered = filtered.filter((e) => e.action === parsed.action);
    }

    if (parsed.actorUserId) {
      filtered = filtered.filter((e) => e.actor.userId === parsed.actorUserId);
    }

    if (parsed.resourceType) {
      filtered = filtered.filter((e) => e.resource.type === parsed.resourceType);
    }

    if (parsed.resourceId) {
      filtered = filtered.filter((e) => e.resource.id === parsed.resourceId);
    }

    if (parsed.sessionId) {
      filtered = filtered.filter((e) => e.sessionId === parsed.sessionId);
    }

    if (parsed.after) {
      const afterDate = new Date(parsed.after).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() > afterDate);
    }

    if (parsed.before) {
      const beforeDate = new Date(parsed.before).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() < beforeDate);
    }

    // Apply pagination
    const limit = parsed.limit ?? 100;
    const offset = parsed.offset ?? 0;
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Verify the integrity of the entire audit chain.
   * Returns true if all hashes are valid and chain is unbroken.
   */
  async verifyChain(): Promise<{ valid: boolean; brokenAt: number | null }> {
    let expectedPreviousHash = "0".repeat(64);

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      if (!event) {
        return { valid: false, brokenAt: i };
      }

      // Verify previous hash linkage
      if (event.previousHash !== expectedPreviousHash) {
        return { valid: false, brokenAt: i };
      }

      // Recompute entry hash
      const eventData = {
        eventId: event.eventId,
        timestamp: event.timestamp,
        action: event.action,
        actor: event.actor,
        resource: event.resource,
        detail: event.detail,
        result: event.result,
        errorCode: event.errorCode,
        sessionId: event.sessionId,
        previousHash: event.previousHash,
      };

      const hashInput = JSON.stringify(eventData, Object.keys(eventData).sort());
      const computedHash = await sha256(hashInput);

      if (computedHash !== event.entryHash) {
        return { valid: false, brokenAt: i };
      }

      expectedPreviousHash = event.entryHash;
    }

    return { valid: true, brokenAt: null };
  }

  /**
   * Get the total number of events in the trail.
   */
  get length(): number {
    return this.events.length;
  }

  /**
   * Get the hash of the last event (for external anchoring).
   */
  get latestHash(): string {
    return this.lastHash;
  }

  /**
   * Export the full audit trail as JSON (for backup/archival).
   */
  export(): string {
    return JSON.stringify(this.events, null, 2);
  }

  /**
   * Import events from a JSON string. Validates chain integrity after import.
   */
  async import(json: string): Promise<{ success: boolean; error?: string }> {
    let parsed: unknown[];
    try {
      parsed = JSON.parse(json) as unknown[];
    } catch {
      return { success: false, error: "Invalid JSON" };
    }

    if (!Array.isArray(parsed)) {
      return { success: false, error: "Expected array of events" };
    }

    const importedEvents: AuditEvent[] = [];
    for (const item of parsed) {
      const result = AuditEventSchema.safeParse(item);
      if (!result.success) {
        return { success: false, error: `Invalid event: ${result.error.message}` };
      }
      importedEvents.push(result.data);
    }

    // Temporarily add events and verify
    const previousEvents = [...this.events];
    const previousHash = this.lastHash;

    this.events.length = 0;
    this.events.push(...importedEvents);
    if (importedEvents.length > 0) {
      const lastEvent = importedEvents[importedEvents.length - 1];
      this.lastHash = lastEvent ? lastEvent.entryHash : "0".repeat(64);
    } else {
      this.lastHash = "0".repeat(64);
    }

    const verification = await this.verifyChain();
    if (!verification.valid) {
      // Rollback
      this.events.length = 0;
      this.events.push(...previousEvents);
      this.lastHash = previousHash;
      return { success: false, error: `Chain integrity failed at index ${verification.brokenAt}` };
    }

    return { success: true };
  }
}
