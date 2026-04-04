import { describe, test, expect } from "bun:test";
import app from "../index";

// ── AI Route Input Validation Tests ─────────────────────────────────
// These tests verify input validation. Actual AI calls require API keys
// so we only test the validation layer and error responses.

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
  });

  test("rejects missing messages", async () => {
    const res = await app.request("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid role", async () => {
    const res = await app.request("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "invalid", content: "hello" }],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/generate-ui", () => {
  test("rejects empty description", async () => {
    const res = await app.request("/api/ai/generate-ui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects missing description", async () => {
    const res = await app.request("/api/ai/generate-ui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/generate-layout", () => {
  test("rejects empty description", async () => {
    const res = await app.request("/api/ai/generate-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects missing description", async () => {
    const res = await app.request("/api/ai/generate-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid compute tier", async () => {
    const res = await app.request("/api/ai/generate-layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "A landing page", computeTier: "invalid" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/site-builder", () => {
  test("rejects empty messages", async () => {
    const res = await app.request("/api/ai/site-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid temperature", async () => {
    const res = await app.request("/api/ai/site-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "build me a site" }],
        temperature: 5,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid maxTokens", async () => {
    const res = await app.request("/api/ai/site-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "build me a site" }],
        maxTokens: -1,
      }),
    });
    expect(res.status).toBe(400);
  });
});
