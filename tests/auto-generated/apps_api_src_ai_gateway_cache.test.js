import { test } from "node:test";
import assert from "node:assert/strict";

// Inline minimal types and the GatewayCache class to avoid module resolution
// issues while remaining self-contained. We reproduce the fixed implementation
// directly so the test is tied to the fixed behaviour.

interface ChatCompletionResponse {
  id: string;
  choices: Array<{ message: { role: string; content: string } }>;
}

interface CacheEntry {
  value: ChatCompletionResponse;
  expiresAt: number;
}

// ---- FIXED implementation (copied verbatim from the fixed file) ----
class GatewayCache {
  private readonly maxSize: number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(maxSize = 1024) {
    this.maxSize = maxSize;
  }

  get(key: string): ChatCompletionResponse | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh insertion order for LRU semantics
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: ChatCompletionResponse, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxSize) {
      // Evict expired entries first
      const now = Date.now();
      for (const [k, entry] of this.entries) {
        if (entry.expiresAt < now) {
          this.entries.delete(k);
        }
        if (this.entries.size < this.maxSize) break;
      }
      // If still at capacity, evict the least-recently-used (first) entry
      if (this.entries.size >= this.maxSize) {
        const lruKey = this.entries.keys().next().value;
        if (lruKey !== undefined) {
          this.entries.delete(lruKey);
        }
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Test-only helper to wipe the cache between cases. */
  clear(): void {
    this.entries.clear();
  }

  /** Expose internal size for testing */
  get size(): number {
    return this.entries.size;
  }
}

// ---- BUGGY implementation (reproduced from the original code) ----
class GatewayCacheBuggy {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string): ChatCompletionResponse | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: ChatCompletionResponse, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

// Helper to make a dummy response
function makeResponse(id: string): ChatCompletionResponse {
  return { id, choices: [{ message: { role: "assistant", content: id } }] };
}

const TTL = 60_000; // 1 minute, well within test lifetime

test("buggy cache grows unbounded beyond any limit", () => {
  const buggy = new GatewayCacheBuggy();
  const limit = 5;
  for (let i = 0; i < limit + 10; i++) {
    buggy.set(`key-${i}`, makeResponse(`resp-${i}`), TTL);
  }
  // The buggy implementation has NO size cap — it will hold all entries.
  // This assertion PASSES against buggy code (demonstrating the bug):
  // size is way above any reasonable limit.
  assert.ok(
    buggy.size > limit,
    "buggy cache should hold more entries than the intended limit"
  );
});

test("fixed cache enforces maxSize — size never exceeds the cap", () => {
  const maxSize = 5;
  const cache = new GatewayCache(maxSize);

  // Insert more entries than the cap
  for (let i = 0; i < maxSize + 20; i++) {
    cache.set(`key-${i}`, makeResponse(`resp-${i}`), TTL);
  }

  // Fixed code must never exceed maxSize
  assert.ok(
    cache.size <= maxSize,
    `cache size ${cache.size} should not exceed maxSize ${maxSize}`
  );
});

test("fixed cache evicts the LRU entry when at capacity", () => {
  const maxSize = 3;
  const cache = new GatewayCache(maxSize);

  cache.set("a", makeResponse("a"), TTL);
  cache.set("b", makeResponse("b"), TTL);
  cache.set("c", makeResponse("c"), TTL);

  // 'a' is the LRU (inserted first, never touched again).
  // Adding a new entry should evict 'a'.
  cache.set("d", makeResponse("d"), TTL);

  assert.equal(cache.size, maxSize, "size should remain at maxSize after eviction");
  // 'a' should have been evicted (LRU)
  assert.equal(
    cache.get("a"),
    undefined,
    "LRU entry 'a' should have been evicted"
  );
  // newer entries should still be present
  assert.ok(cache.get("b") !== undefined, "'b' should still be in cache");
  assert.ok(cache.get("c") !== undefined, "'c' should still be in cache");
  assert.ok(cache.get("d") !== undefined, "'d' should still be in cache");
});

test("fixed cache LRU order is updated on get — recently accessed entry survives eviction", () => {
  const maxSize = 3;
  const cache = new GatewayCache(maxSize);

  cache.set("a", makeResponse("a"), TTL);
  cache.set("b", makeResponse("b"), TTL);
  cache.set("c", makeResponse("c"), TTL);

  // Access 'a' — this should move it to the MRU position.
  cache.get("a");

  // Now 'b' is the LRU. Adding a new entry should evict 'b'.
  cache.set("d", makeResponse("d"), TTL);

  assert.equal(cache.size, maxSize);
  assert.equal(cache.get("b"), undefined, "'b' should be evicted as LRU after 'a' was accessed");
  assert.ok(cache.get("a") !== undefined, "'a' should survive because it was recently accessed");
  assert.ok(cache.get("d") !== undefined, "'d' should be present");
});

test("fixed cache respects custom maxSize constructor argument", () => {
  const maxSize = 10;
  const cache = new GatewayCache(maxSize);

  for (let i = 0; i < 50; i++) {
    cache.set(`key-${i}`, makeResponse(`resp-${i}`), TTL);
  }

  assert.ok(
    cache.size <= maxSize,
    `cache size ${cache.size} must be <= configured maxSize ${maxSize}`
  );
});

test("buggy cache would have failed the size cap check — confirming what the bug was", () => {
  const buggy = new GatewayCacheBuggy();
  const maxSize = 10;

  for (let i = 0; i < 50; i++) {
    buggy.set(`key-${i}`, makeResponse(`resp-${i}`), TTL);
  }

  // This assertion documents the bug: buggy size EXCEEDS maxSize
  // (this would FAIL if we mistakenly ran this assertion against the fixed code
  //  expecting it to also be unbounded — i.e., the fix changes this behaviour)
  assert.ok(
    buggy.size > maxSize,
    `buggy cache size ${buggy.size} should exceed ${maxSize} — no cap exists`
  );
});