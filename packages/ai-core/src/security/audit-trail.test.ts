import { describe, test, expect, beforeEach } from "bun:test";
import {
  AuditTrail,
  AuditEventSchema,
  AuditEventInputSchema,
  AuditFilterSchema,
  AuditActionSchema,
  type AuditEventInput,
} from "./audit-trail";

function makeInput(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    action: "CREATE",
    actor: { userId: "user-1", displayName: "Test User", role: "admin" },
    resource: { type: "document", id: "doc-123" },
    detail: { field: "title", before: null, after: "New Title" },
    result: "success",
    sessionId: "session-abc",
    ...overrides,
  };
}

describe("AuditTrail", () => {
  let trail: AuditTrail;

  beforeEach(() => {
    trail = new AuditTrail();
  });

  describe("log()", () => {
    test("creates an audit event with all required fields", async () => {
      const event = await trail.log(makeInput());

      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.action).toBe("CREATE");
      expect(event.actor.userId).toBe("user-1");
      expect(event.resource.type).toBe("document");
      expect(event.resource.id).toBe("doc-123");
      expect(event.previousHash).toBeDefined();
      expect(event.entryHash).toBeDefined();
      expect(event.sessionId).toBe("session-abc");
    });

    test("generates valid UUID for eventId", async () => {
      const event = await trail.log(makeInput());
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(event.eventId).toMatch(uuidRegex);
    });

    test("generates ISO 8601 timestamp", async () => {
      const event = await trail.log(makeInput());
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(event.timestamp).toContain("T");
    });

    test("first event has genesis hash as previousHash", async () => {
      const event = await trail.log(makeInput());
      expect(event.previousHash).toBe("0".repeat(64));
    });

    test("second event references first event hash", async () => {
      const first = await trail.log(makeInput());
      const second = await trail.log(makeInput({ action: "UPDATE" }));

      expect(second.previousHash).toBe(first.entryHash);
    });

    test("hash chain links correctly across multiple events", async () => {
      const events = [];
      for (let i = 0; i < 5; i++) {
        events.push(await trail.log(makeInput({ action: "READ" })));
      }

      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.previousHash).toBe(events[i - 1]!.entryHash);
      }
    });

    test("generates unique entryHash per event", async () => {
      const hashes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const event = await trail.log(makeInput());
        hashes.add(event.entryHash);
      }
      expect(hashes.size).toBe(10);
    });

    test("validates input with Zod schema", async () => {
      await expect(
        trail.log({ action: "INVALID" } as unknown as AuditEventInput),
      ).rejects.toThrow();
    });

    test("increments trail length", async () => {
      expect(trail.length).toBe(0);
      await trail.log(makeInput());
      expect(trail.length).toBe(1);
      await trail.log(makeInput());
      expect(trail.length).toBe(2);
    });
  });

  describe("getEvents()", () => {
    test("returns all events when no filter is provided", async () => {
      await trail.log(makeInput({ action: "CREATE" }));
      await trail.log(makeInput({ action: "READ" }));
      await trail.log(makeInput({ action: "UPDATE" }));

      const events = trail.getEvents();
      expect(events).toHaveLength(3);
    });

    test("filters by action", async () => {
      await trail.log(makeInput({ action: "CREATE" }));
      await trail.log(makeInput({ action: "READ" }));
      await trail.log(makeInput({ action: "CREATE" }));

      const events = trail.getEvents({ action: "CREATE" });
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.action === "CREATE")).toBe(true);
    });

    test("filters by actor userId", async () => {
      await trail.log(makeInput({ actor: { userId: "user-1" } }));
      await trail.log(makeInput({ actor: { userId: "user-2" } }));
      await trail.log(makeInput({ actor: { userId: "user-1" } }));

      const events = trail.getEvents({ actorUserId: "user-1" });
      expect(events).toHaveLength(2);
    });

    test("filters by resource type", async () => {
      await trail.log(makeInput({ resource: { type: "document", id: "1" } }));
      await trail.log(makeInput({ resource: { type: "user", id: "2" } }));

      const events = trail.getEvents({ resourceType: "document" });
      expect(events).toHaveLength(1);
      expect(events[0]!.resource.type).toBe("document");
    });

    test("filters by resource ID", async () => {
      await trail.log(makeInput({ resource: { type: "doc", id: "abc" } }));
      await trail.log(makeInput({ resource: { type: "doc", id: "xyz" } }));

      const events = trail.getEvents({ resourceId: "abc" });
      expect(events).toHaveLength(1);
    });

    test("filters by session ID", async () => {
      await trail.log(makeInput({ sessionId: "s1" }));
      await trail.log(makeInput({ sessionId: "s2" }));
      await trail.log(makeInput({ sessionId: "s1" }));

      const events = trail.getEvents({ sessionId: "s1" });
      expect(events).toHaveLength(2);
    });

    test("applies limit", async () => {
      for (let i = 0; i < 10; i++) {
        await trail.log(makeInput());
      }

      const events = trail.getEvents({ limit: 3 });
      expect(events).toHaveLength(3);
    });

    test("applies offset", async () => {
      for (let i = 0; i < 5; i++) {
        await trail.log(makeInput());
      }

      const all = trail.getEvents();
      const offset = trail.getEvents({ offset: 2 });
      expect(offset).toHaveLength(3);
      expect(offset[0]!.eventId).toBe(all[2]!.eventId);
    });

    test("applies limit and offset together", async () => {
      for (let i = 0; i < 10; i++) {
        await trail.log(makeInput());
      }

      const events = trail.getEvents({ limit: 3, offset: 5 });
      expect(events).toHaveLength(3);
    });
  });

  describe("verifyChain()", () => {
    test("valid chain passes verification", async () => {
      await trail.log(makeInput({ action: "CREATE" }));
      await trail.log(makeInput({ action: "READ" }));
      await trail.log(makeInput({ action: "UPDATE" }));

      const result = await trail.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeNull();
    });

    test("empty chain is valid", async () => {
      const result = await trail.verifyChain();
      expect(result.valid).toBe(true);
    });

    test("single event chain is valid", async () => {
      await trail.log(makeInput());
      const result = await trail.verifyChain();
      expect(result.valid).toBe(true);
    });
  });

  describe("latestHash", () => {
    test("starts with genesis hash", () => {
      expect(trail.latestHash).toBe("0".repeat(64));
    });

    test("updates after logging an event", async () => {
      const event = await trail.log(makeInput());
      expect(trail.latestHash).toBe(event.entryHash);
    });
  });

  describe("export() and import()", () => {
    test("exports valid JSON", async () => {
      await trail.log(makeInput({ action: "CREATE" }));
      await trail.log(makeInput({ action: "READ" }));

      const json = trail.export();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    test("imported events pass chain verification", async () => {
      await trail.log(makeInput({ action: "CREATE" }));
      await trail.log(makeInput({ action: "READ" }));
      await trail.log(makeInput({ action: "UPDATE" }));

      const json = trail.export();

      const newTrail = new AuditTrail();
      const importResult = await newTrail.import(json);
      expect(importResult.success).toBe(true);

      const verifyResult = await newTrail.verifyChain();
      expect(verifyResult.valid).toBe(true);
    });

    test("rejects invalid JSON on import", async () => {
      const result = await trail.import("not valid json");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid JSON");
    });

    test("rejects non-array JSON on import", async () => {
      const result = await trail.import('{"not": "array"}');
      expect(result.success).toBe(false);
      expect(result.error).toContain("Expected array");
    });
  });

  describe("Zod Schemas", () => {
    test("AuditActionSchema validates known actions", () => {
      expect(AuditActionSchema.parse("CREATE")).toBe("CREATE");
      expect(AuditActionSchema.parse("READ")).toBe("READ");
      expect(AuditActionSchema.parse("DELETE")).toBe("DELETE");
      expect(AuditActionSchema.parse("SIGN")).toBe("SIGN");
      expect(() => AuditActionSchema.parse("INVALID")).toThrow();
    });

    test("AuditEventInputSchema validates complete input", () => {
      const input = makeInput();
      const result = AuditEventInputSchema.parse(input);
      expect(result.action).toBe("CREATE");
    });

    test("AuditEventSchema validates complete event", async () => {
      const event = await trail.log(makeInput());
      const result = AuditEventSchema.parse(event);
      expect(result.eventId).toBe(event.eventId);
    });

    test("AuditFilterSchema applies defaults", () => {
      const filter = AuditFilterSchema.parse({});
      expect(filter.limit).toBe(100);
      expect(filter.offset).toBe(0);
    });
  });
});
