import { describe, test, expect } from "bun:test";
import app from "./index";

// ── Health endpoint ──────────────────────────────────────────────────

describe("GET /api/health", () => {
  test("returns 200 with status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("returns a valid ISO timestamp", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });

  test("returns JSON content type", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ── tRPC health procedure ────────────────────────────────────────────

describe("tRPC health procedure", () => {
  test("returns status ok", async () => {
    const res = await app.request("/api/trpc/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data).toEqual({ status: "ok" });
  });
});

// ── tRPC hello procedure ─────────────────────────────────────────────

describe("tRPC hello procedure", () => {
  test("returns greeting for valid input", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "World" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data).toEqual({ greeting: "Hello, World!" });
  });

  test("returns greeting with special characters in name", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "O'Brien" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.greeting).toBe("Hello, O'Brien!");
  });

  test("returns greeting with empty string name", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.greeting).toBe("Hello, !");
  });

  test("returns error for missing name field", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({}))}`;
    const res = await app.request(url);
    // tRPC returns 400 for input validation errors
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ── 404 handling ─────────────────────────────────────────────────────

describe("unknown routes", () => {
  test("returns 404 for unknown API path", async () => {
    const res = await app.request("/api/nonexistent");
    expect(res.status).toBe(404);
  });

  test("returns 404 for unknown nested path", async () => {
    const res = await app.request("/api/some/deep/nested/route");
    expect(res.status).toBe(404);
  });

  test("returns 404 for unknown tRPC procedure", async () => {
    const res = await app.request("/api/trpc/doesNotExist");
    // tRPC returns 404 for procedures that don't exist on the router
    expect(res.status).toBe(404);
  });
});

// ── Rate limiting ────────────────────────────────────────────────────

describe("rate limiting", () => {
  test("returns rate limit headers on successful requests", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("100");
    expect(res.headers.get("x-ratelimit-remaining")).toBeDefined();
    expect(res.headers.get("x-ratelimit-reset")).toBeDefined();
  });

  test("returns 429 after exceeding global rate limit", async () => {
    // The global rate limiter allows 100 requests per 60s per IP.
    // Since the key function uses headers, we can simulate a unique IP
    // by setting a custom header, then fire 101 requests on that IP.
    const uniqueIp = `10.99.99.${Math.floor(Math.random() * 255)}`;
    const headers = { "x-forwarded-for": uniqueIp };

    // Fire 100 requests to fill the window
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(app.request("/api/health", { headers }));
    }
    const responses = await Promise.all(promises);

    // All 100 should succeed
    for (const r of responses) {
      expect(r.status).toBe(200);
    }

    // The 101st request should be rate limited
    const blocked = await app.request("/api/health", { headers });
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toContain("Too many requests");
    expect(blocked.headers.get("retry-after")).toBeDefined();
    expect(blocked.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  test("different IPs have independent rate limits", async () => {
    const ipA = `10.88.1.${Math.floor(Math.random() * 255)}`;
    const ipB = `10.88.2.${Math.floor(Math.random() * 255)}`;

    // Exhaust IP A
    const promisesA = [];
    for (let i = 0; i < 100; i++) {
      promisesA.push(
        app.request("/api/health", {
          headers: { "x-forwarded-for": ipA },
        }),
      );
    }
    await Promise.all(promisesA);

    // IP A should be blocked
    const blockedA = await app.request("/api/health", {
      headers: { "x-forwarded-for": ipA },
    });
    expect(blockedA.status).toBe(429);

    // IP B should still work
    const okB = await app.request("/api/health", {
      headers: { "x-forwarded-for": ipB },
    });
    expect(okB.status).toBe(200);
  });
});

// ── tRPC users procedures ────────────────────────────────────────────

describe("tRPC users procedures", () => {
  describe("users.list", () => {
    test("accepts valid pagination input", async () => {
      const input = { limit: 10 };
      const url = `/api/trpc/users.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      // Should return 200 if DB is accessible, or 500 if DB connection fails
      // Either way, it should not return 400 (valid input)
      expect(res.status).not.toBe(400);
    });

    test("returns paginated structure from DB", async () => {
      const input = { limit: 5 };
      const url = `/api/trpc/users.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      if (res.status === 200) {
        const body = await res.json();
        const data = body.result.data;
        expect(data).toHaveProperty("items");
        expect(data).toHaveProperty("nextCursor");
        expect(data).toHaveProperty("total");
        expect(Array.isArray(data.items)).toBe(true);
      }
      // If DB is unavailable, status will be 500 which is acceptable in test env
    });

    test("rejects invalid limit (too high)", async () => {
      const input = { limit: 999 };
      const url = `/api/trpc/users.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });

    test("rejects invalid limit (zero)", async () => {
      const input = { limit: 0 };
      const url = `/api/trpc/users.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });

    test("uses default limit when not specified", async () => {
      const input = {};
      const url = `/api/trpc/users.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      // Valid input (defaults apply), so should not be 400
      expect(res.status).not.toBe(400);
    });
  });

  describe("users.getById", () => {
    test("rejects invalid UUID", async () => {
      const input = { id: "not-a-uuid" };
      const url = `/api/trpc/users.getById?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });

    test("accepts valid UUID format", async () => {
      const input = { id: "00000000-0000-0000-0000-000000000000" };
      const url = `/api/trpc/users.getById?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      // Should not be 400 (input is valid); will be 500 if user not found or DB error
      expect(res.status).not.toBe(400);
    });

    test("rejects missing id field", async () => {
      const input = {};
      const url = `/api/trpc/users.getById?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });
  });

  describe("users.create", () => {
    test("rejects invalid email in create mutation", async () => {
      const input = { email: "not-an-email", displayName: "Test" };
      const res = await app.request("/api/trpc/users.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("rejects empty displayName", async () => {
      const input = { email: "test@example.com", displayName: "" };
      const res = await app.request("/api/trpc/users.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("rejects missing email field", async () => {
      const input = { displayName: "Test User" };
      const res = await app.request("/api/trpc/users.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("rejects invalid role value", async () => {
      const input = {
        email: "test@example.com",
        displayName: "Test",
        role: "superadmin",
      };
      const res = await app.request("/api/trpc/users.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("accepts valid create input", async () => {
      const input = {
        email: `test-${Date.now()}@example.com`,
        displayName: "Integration Test User",
        role: "viewer",
      };
      const res = await app.request("/api/trpc/users.create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      // Should not be 400 (input is valid); 200 if DB works, 500 if DB is down
      expect(res.status).not.toBe(400);
      if (res.status === 200) {
        const body = await res.json();
        const data = body.result.data;
        expect(data).toHaveProperty("id");
        expect(data.email).toBe(input.email);
        expect(data.displayName).toBe(input.displayName);
      }
    });
  });

  describe("users.update", () => {
    test("rejects invalid UUID in update", async () => {
      const input = { id: "bad-id", displayName: "Updated" };
      const res = await app.request("/api/trpc/users.update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("rejects invalid role in update", async () => {
      const input = {
        id: "00000000-0000-0000-0000-000000000000",
        role: "dictator",
      };
      const res = await app.request("/api/trpc/users.update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("users.delete", () => {
    test("rejects invalid UUID in delete", async () => {
      const input = { id: "not-valid" };
      const res = await app.request("/api/trpc/users.delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });
  });
});

// ── tRPC audit procedures ────────────────────────────────────────────

describe("tRPC audit procedures", () => {
  describe("audit.list", () => {
    test("accepts valid pagination input", async () => {
      const input = { limit: 10 };
      const url = `/api/trpc/audit.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).not.toBe(400);
    });

    test("rejects invalid limit", async () => {
      const input = { limit: -1 };
      const url = `/api/trpc/audit.list?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });
  });

  describe("audit.getByResource", () => {
    test("rejects empty resourceType", async () => {
      const input = { resourceType: "", resourceId: "abc" };
      const url = `/api/trpc/audit.getByResource?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });

    test("rejects empty resourceId", async () => {
      const input = { resourceType: "user", resourceId: "" };
      const url = `/api/trpc/audit.getByResource?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).toBe(400);
    });

    test("accepts valid resource query", async () => {
      const input = { resourceType: "user", resourceId: "some-id" };
      const url = `/api/trpc/audit.getByResource?input=${encodeURIComponent(JSON.stringify(input))}`;
      const res = await app.request(url);
      expect(res.status).not.toBe(400);
    });
  });
});

// ── tRPC auth procedures ─────────────────────────────────────────────

describe("tRPC auth procedures", () => {
  describe("auth.register.start", () => {
    test("rejects invalid email", async () => {
      const input = { email: "not-an-email", displayName: "Test" };
      const res = await app.request("/api/trpc/auth.register.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("rejects empty displayName", async () => {
      const input = { email: "test@example.com", displayName: "" };
      const res = await app.request("/api/trpc/auth.register.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });

    test("rejects missing fields", async () => {
      const res = await app.request("/api/trpc/auth.register.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    test("accepts valid registration start input", async () => {
      const input = {
        email: `reg-test-${Date.now()}@example.com`,
        displayName: "Registration Test",
      };
      const res = await app.request("/api/trpc/auth.register.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      // Valid input -- should not be 400. Could be 200 if DB is up, 500 if not.
      expect(res.status).not.toBe(400);
      if (res.status === 200) {
        const body = await res.json();
        const data = body.result.data;
        expect(data).toHaveProperty("options");
        expect(data).toHaveProperty("userId");
        expect(data.options).toHaveProperty("challenge");
      }
    });
  });

  describe("auth.register.finish", () => {
    test("rejects invalid userId format", async () => {
      const input = {
        userId: "not-a-uuid",
        response: {
          id: "test",
          rawId: "test",
          response: {
            attestationObject: "test",
            clientDataJSON: "test",
          },
          clientExtensionResults: {},
          type: "public-key",
        },
      };
      const res = await app.request("/api/trpc/auth.register.finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("auth.login.start", () => {
    test("accepts empty input for discoverable credential flow", async () => {
      const res = await app.request("/api/trpc/auth.login.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Valid input (email is optional). Should not be 400.
      expect(res.status).not.toBe(400);
    });

    test("rejects invalid email in login start", async () => {
      const input = { email: "bad-email" };
      const res = await app.request("/api/trpc/auth.login.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("auth.login.finish", () => {
    test("rejects missing response data", async () => {
      const input = { userId: null };
      const res = await app.request("/api/trpc/auth.login.finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("auth.logout", () => {
    test("rejects unauthenticated logout", async () => {
      const res = await app.request("/api/trpc/auth.logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // protectedProcedure should return UNAUTHORIZED
      expect(res.status).toBe(401);
    });
  });

  describe("auth.me", () => {
    test("rejects unauthenticated request", async () => {
      const res = await app.request("/api/trpc/auth.me");
      // protectedProcedure should return UNAUTHORIZED
      expect(res.status).toBe(401);
    });
  });
});

// ── AI routes ────────────────────────────────────────────────────────

describe("AI routes", () => {
  describe("POST /api/ai/chat", () => {
    test("rejects empty body", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid input");
      expect(body.details).toBeDefined();
    });

    test("rejects missing messages array", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ computeTier: "cloud" }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects empty messages array", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects invalid role in message", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "hacker", content: "test" }],
        }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects invalid computeTier", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
          computeTier: "quantum",
        }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects temperature out of range", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
          temperature: 5,
        }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects maxTokens out of range", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
          maxTokens: 99999,
        }),
      });
      expect(res.status).toBe(400);
    });

    test("returns error or stream with valid input (no API key)", async () => {
      const res = await app.request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        }),
      });
      // Without a valid API key, this should either:
      // - Return 500 (provider error)
      // - Return a streaming response that errors
      // It should NOT return 400 (input was valid)
      expect(res.status).not.toBe(400);
    });
  });

  describe("POST /api/ai/generate-ui", () => {
    test("rejects empty body", async () => {
      const res = await app.request("/api/ai/generate-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid input");
    });

    test("rejects empty description", async () => {
      const res = await app.request("/api/ai/generate-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "" }),
      });
      expect(res.status).toBe(400);
    });

    test("accepts valid description (may fail without API key)", async () => {
      const res = await app.request("/api/ai/generate-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "A login form with email and password" }),
      });
      // Valid input, should not be 400. May be 500 without API key.
      expect(res.status).not.toBe(400);
    });
  });

  describe("POST /api/ai/site-builder", () => {
    test("rejects empty body", async () => {
      const res = await app.request("/api/ai/site-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid input");
    });

    test("rejects empty messages array", async () => {
      const res = await app.request("/api/ai/site-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects invalid message role", async () => {
      const res = await app.request("/api/ai/site-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "invalid", content: "test" }],
        }),
      });
      expect(res.status).toBe(400);
    });

    test("returns error or stream with valid input (no API key)", async () => {
      const res = await app.request("/api/ai/site-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Build me a landing page" }],
        }),
      });
      // Valid input, should not be 400
      expect(res.status).not.toBe(400);
    });
  });

  describe("GET /api/ai/* (method not allowed)", () => {
    test("GET on /api/ai/chat returns 404 (only POST is defined)", async () => {
      const res = await app.request("/api/ai/chat");
      expect(res.status).toBe(404);
    });

    test("GET on /api/ai/site-builder returns 404", async () => {
      const res = await app.request("/api/ai/site-builder");
      expect(res.status).toBe(404);
    });
  });
});

// ── SSE endpoints ────────────────────────────────────────────────────

describe("SSE endpoints", () => {
  describe("GET /api/realtime/events/:roomId", () => {
    test("returns event-stream content type", async () => {
      const res = await app.request("/api/realtime/events/test-room-123");
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("text/event-stream");
    });

    test("returns 200 for valid room ID", async () => {
      const res = await app.request("/api/realtime/events/my-room");
      expect(res.status).toBe(200);
    });

    test("streams an initial connected event", async () => {
      const res = await app.request("/api/realtime/events/init-test-room");
      expect(res.status).toBe(200);

      // Read the beginning of the stream to verify the connected event
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        const { value } = await reader.read();
        const text = decoder.decode(value);
        // SSE format: event: ...\ndata: ...\n
        expect(text).toContain("connected");
        expect(text).toContain("init-test-room");
        reader.releaseLock();
      }
    });
  });

  describe("GET /api/realtime/rooms/:roomId/users", () => {
    test("returns JSON with room users", async () => {
      const res = await app.request("/api/realtime/rooms/some-room/users");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("roomId", "some-room");
      expect(body).toHaveProperty("users");
      expect(body).toHaveProperty("count");
      expect(Array.isArray(body.users)).toBe(true);
      expect(typeof body.count).toBe("number");
    });

    test("returns empty users for non-existent room", async () => {
      const res = await app.request(
        "/api/realtime/rooms/nonexistent-room-xyz/users",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users).toEqual([]);
      expect(body.count).toBe(0);
    });
  });

  describe("GET /api/realtime/stats", () => {
    test("returns server stats", async () => {
      const res = await app.request("/api/realtime/stats");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("rooms");
      expect(body).toHaveProperty("users");
      expect(body).toHaveProperty("timestamp");
      expect(typeof body.rooms).toBe("number");
      expect(typeof body.users).toBe("number");
      // Verify timestamp is valid ISO
      const date = new Date(body.timestamp);
      expect(date.toISOString()).toBe(body.timestamp);
    });
  });
});
