// ── Yjs CRDT Collaboration Integration Tests ────────────────────────
// Tests document creation, concurrent edits, undo/redo, awareness,
// offline/reconnect, and all shared type operations (text, map, array).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as Y from "yjs";
import { createCollabSession, destroyCollabSession } from "./yjs-provider";
import type { CollabSession } from "./yjs-provider";

// ── Mock WebSocket ──────────────────────────────────────────────────

/** Minimal WebSocket mock that y-websocket can instantiate. */
class MockWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  readyState: number = MockWebSocket.OPEN;
  url: string;
  binaryType = "arraybuffer";

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private listeners: Map<string, Array<(ev: unknown) => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    // Simulate async open
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      const ev = new Event("open");
      this.onopen?.(ev);
      this.emit("open", ev);
    });
  }

  send(_data: ArrayBuffer | string): void {
    // No-op in tests — messages stay local
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    const ev = new CloseEvent("close", { code: 1000, reason: "test" });
    this.onclose?.(ev);
    this.emit("close", ev);
  }

  addEventListener(type: string, listener: (ev: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (ev: unknown) => void): void {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(
        type,
        list.filter((l) => l !== listener),
      );
    }
  }

  private emit(type: string, ev: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(ev);
    }
  }
}

// Install mock globally before y-websocket tries to use it.
// biome-ignore lint/suspicious/noExplicitAny: global override for test mock
(globalThis as Record<string, unknown>).WebSocket = MockWebSocket as unknown as typeof WebSocket;

// ── Helpers ─────────────────────────────────────────────────────────

/** Synchronize two Y.Doc instances as if they were connected peers. */
function syncDocs(docA: Y.Doc, docB: Y.Doc): void {
  const stateVectorA = Y.encodeStateVector(docA);
  const stateVectorB = Y.encodeStateVector(docB);
  const diffAtoB = Y.encodeStateAsUpdate(docA, stateVectorB);
  const diffBtoA = Y.encodeStateAsUpdate(docB, stateVectorA);
  Y.applyUpdate(docB, diffAtoB);
  Y.applyUpdate(docA, diffBtoA);
}

/** Create a standalone Y.Doc (no provider) for unit-level tests. */
function createDoc(): Y.Doc {
  return new Y.Doc();
}

// ── Document creation & binding ─────────────────────────────────────

describe("Yjs document creation and binding", () => {
  let session: CollabSession;

  afterEach(() => {
    destroyCollabSession(session);
  });

  test("createCollabSession returns doc, provider, and awareness", () => {
    session = createCollabSession("test-room", "ws://localhost:1234");

    expect(session.doc).toBeInstanceOf(Y.Doc);
    expect(session.provider).toBeDefined();
    expect(session.awareness).toBeDefined();
  });

  test("doc has a unique clientID", () => {
    session = createCollabSession("test-room-id", "ws://localhost:1234");
    expect(typeof session.doc.clientID).toBe("number");
    expect(session.doc.clientID).toBeGreaterThan(0);
  });

  test("provider is connected to the correct room", () => {
    session = createCollabSession("my-room", "ws://localhost:1234");
    expect(session.provider.roomname).toBe("my-room");
  });

  test("destroyCollabSession cleans up without errors", () => {
    session = createCollabSession("cleanup-room", "ws://localhost:1234");
    // Should not throw
    expect(() => destroyCollabSession(session)).not.toThrow();
    // Create a fresh session so afterEach doesn't double-destroy
    session = createCollabSession("cleanup-room-2", "ws://localhost:1234");
  });
});

// ── Concurrent edits (simulate two clients) ─────────────────────────

describe("concurrent edits merge correctly", () => {
  let docA: Y.Doc;
  let docB: Y.Doc;

  beforeEach(() => {
    docA = createDoc();
    docB = createDoc();
  });

  afterEach(() => {
    docA.destroy();
    docB.destroy();
  });

  test("concurrent text inserts at different positions merge", () => {
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    // Both start with same base
    textA.insert(0, "Hello World");
    syncDocs(docA, docB);
    expect(textB.toString()).toBe("Hello World");

    // Client A inserts at start, Client B appends
    textA.insert(0, "Oh! ");
    textB.insert(textB.length, "!!!");
    syncDocs(docA, docB);

    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("Oh! ");
    expect(textA.toString()).toContain("!!!");
  });

  test("concurrent map updates on different keys merge", () => {
    const mapA = docA.getMap<string>("settings");
    const mapB = docB.getMap<string>("settings");

    mapA.set("theme", "dark");
    mapB.set("lang", "en");
    syncDocs(docA, docB);

    expect(mapA.get("theme")).toBe("dark");
    expect(mapA.get("lang")).toBe("en");
    expect(mapB.get("theme")).toBe("dark");
    expect(mapB.get("lang")).toBe("en");
  });

  test("concurrent map updates on same key resolve to one value", () => {
    const mapA = docA.getMap<string>("config");
    const mapB = docB.getMap<string>("config");

    mapA.set("color", "red");
    mapB.set("color", "blue");
    syncDocs(docA, docB);

    // After sync, both docs must agree (last-writer per CRDT resolution)
    expect(mapA.get("color")).toBe(mapB.get("color"));
  });

  test("concurrent array pushes from two clients merge", () => {
    const arrA = docA.getArray<string>("items");
    const arrB = docB.getArray<string>("items");

    arrA.push(["item-a1"]);
    arrB.push(["item-b1"]);
    syncDocs(docA, docB);

    expect(arrA.length).toBe(2);
    expect(arrB.length).toBe(2);
    expect(arrA.toJSON()).toEqual(arrB.toJSON());
  });

  test("three-way concurrent edits all converge", () => {
    const docC = createDoc();
    const textA = docA.getText("shared");
    const textB = docB.getText("shared");
    const textC = docC.getText("shared");

    textA.insert(0, "A");
    textB.insert(0, "B");
    textC.insert(0, "C");

    syncDocs(docA, docB);
    syncDocs(docB, docC);
    syncDocs(docA, docC);

    expect(textA.toString()).toBe(textB.toString());
    expect(textB.toString()).toBe(textC.toString());
    expect(textA.length).toBe(3);

    docC.destroy();
  });
});

// ── Undo/Redo manager ───────────────────────────────────────────────

describe("undo/redo manager", () => {
  let doc: Y.Doc;
  let text: Y.Text;
  let undoManager: Y.UndoManager;

  beforeEach(() => {
    doc = createDoc();
    text = doc.getText("editor");
    undoManager = new Y.UndoManager(text);
  });

  afterEach(() => {
    undoManager.destroy();
    doc.destroy();
  });

  test("undo reverts the last insert", () => {
    text.insert(0, "Hello");
    expect(text.toString()).toBe("Hello");

    undoManager.undo();
    expect(text.toString()).toBe("");
  });

  test("redo restores an undone insert", () => {
    text.insert(0, "Hello");
    undoManager.undo();
    expect(text.toString()).toBe("");

    undoManager.redo();
    expect(text.toString()).toBe("Hello");
  });

  test("multiple undo steps work in order", () => {
    // Use captureTimeout: 0 so each insert becomes its own undo step.
    // The default 500ms timeout groups rapid operations into one step.
    undoManager.destroy();
    const um = new Y.UndoManager(text, { captureTimeout: 0 });

    text.insert(0, "First");
    text.insert(5, " Second");
    text.insert(12, " Third");

    expect(text.toString()).toBe("First Second Third");

    um.undo();
    expect(text.toString()).toBe("First Second");

    um.undo();
    expect(text.toString()).toBe("First");

    um.undo();
    expect(text.toString()).toBe("");

    um.destroy();
    // Recreate the shared undoManager for subsequent tests
    undoManager = new Y.UndoManager(text);
  });

  test("undo does not affect edits from other clients", () => {
    // Destroy the shared undoManager so it doesn't interfere
    undoManager.destroy();

    const docB = createDoc();
    const textB = docB.getText("editor");

    const originA = "client-a";

    // Track only origin "client-a" so docB's synced changes are ignored
    const undoManagerA = new Y.UndoManager(text, {
      trackedOrigins: new Set<string | null>([originA]),
    });

    // Client A's edit uses a tracked origin
    doc.transact(() => {
      text.insert(0, "ClientA");
    }, originA);
    syncDocs(doc, docB);

    // Client B's edit comes via sync (no explicit origin on doc A)
    textB.insert(7, " ClientB");
    syncDocs(doc, docB);

    expect(text.toString()).toBe("ClientA ClientB");

    // Undo only client A's edit — remote edits from B are preserved
    undoManagerA.undo();
    expect(text.toString()).toBe(" ClientB");

    undoManagerA.destroy();
    docB.destroy();

    // Recreate the shared undoManager for afterEach cleanup
    undoManager = new Y.UndoManager(text);
  });

  test("canUndo and canRedo report correctly", () => {
    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.canRedo()).toBe(false);

    text.insert(0, "data");
    expect(undoManager.canUndo()).toBe(true);
    expect(undoManager.canRedo()).toBe(false);

    undoManager.undo();
    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.canRedo()).toBe(true);
  });
});

// ── Awareness (presence / cursors) ──────────────────────────────────

describe("awareness (presence and cursors)", () => {
  let sessionA: CollabSession;
  let sessionB: CollabSession;

  beforeEach(() => {
    sessionA = createCollabSession("awareness-room", "ws://localhost:1234");
    sessionB = createCollabSession("awareness-room", "ws://localhost:1234");
  });

  afterEach(() => {
    destroyCollabSession(sessionA);
    destroyCollabSession(sessionB);
  });

  test("setLocalState stores awareness data", () => {
    sessionA.awareness.setLocalState({
      user: { name: "Alice", color: "#ff0000" },
      cursor: { index: 5 },
    });

    const localState = sessionA.awareness.getLocalState();
    expect(localState).toBeDefined();
    expect(localState?.user).toEqual({ name: "Alice", color: "#ff0000" });
    expect(localState?.cursor).toEqual({ index: 5 });
  });

  test("setLocalStateField updates a single field", () => {
    sessionA.awareness.setLocalState({
      user: { name: "Alice" },
      cursor: null,
    });

    sessionA.awareness.setLocalStateField("cursor", { index: 10, line: 3 });

    const state = sessionA.awareness.getLocalState();
    expect(state?.cursor).toEqual({ index: 10, line: 3 });
    expect(state?.user).toEqual({ name: "Alice" });
  });

  test("getStates returns all connected awareness states", () => {
    sessionA.awareness.setLocalState({ user: { name: "Alice" } });

    const states = sessionA.awareness.getStates();
    expect(states.size).toBeGreaterThanOrEqual(1);
  });

  test("awareness emits change event when state updates", () => {
    const changes: Array<{ added: number[]; updated: number[]; removed: number[] }> = [];

    sessionA.awareness.on(
      "change",
      (change: { added: number[]; updated: number[]; removed: number[] }) => {
        changes.push(change);
      },
    );

    sessionA.awareness.setLocalState({ user: { name: "Bob" } });

    // At least one change event should have fired
    expect(changes.length).toBeGreaterThanOrEqual(1);
  });

  test("clearing local state sets it to null", () => {
    sessionA.awareness.setLocalState({ user: { name: "Alice" } });
    expect(sessionA.awareness.getLocalState()).toBeDefined();

    sessionA.awareness.setLocalState(null);
    expect(sessionA.awareness.getLocalState()).toBeNull();
  });
});

// ── Offline / reconnect synchronization ─────────────────────────────

describe("offline/reconnect synchronization", () => {
  test("offline edits sync when docs reconnect", () => {
    const docA = createDoc();
    const docB = createDoc();

    const textA = docA.getText("doc");
    const textB = docB.getText("doc");

    // Initial sync
    textA.insert(0, "Base content");
    syncDocs(docA, docB);
    expect(textB.toString()).toBe("Base content");

    // "Go offline" — edit independently without syncing
    textA.insert(0, "[OFFLINE-A] ");
    textB.insert(textB.length, " [OFFLINE-B]");

    // Verify they diverged
    expect(textA.toString()).not.toBe(textB.toString());

    // "Reconnect" — sync again
    syncDocs(docA, docB);

    // Both docs converge
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("[OFFLINE-A]");
    expect(textA.toString()).toContain("[OFFLINE-B]");
    expect(textA.toString()).toContain("Base content");

    docA.destroy();
    docB.destroy();
  });

  test("state vector diff only transfers missing updates", () => {
    const docA = createDoc();
    const docB = createDoc();

    // Client A makes edits
    const textA = docA.getText("doc");
    textA.insert(0, "First edit. ");
    syncDocs(docA, docB);

    // Client A makes more edits
    textA.insert(textA.length, "Second edit. ");

    // Get the diff — should only contain "Second edit."
    const stateVectorB = Y.encodeStateVector(docB);
    const diff = Y.encodeStateAsUpdate(docA, stateVectorB);

    // Apply only the diff
    Y.applyUpdate(docB, diff);

    const textB = docB.getText("doc");
    expect(textB.toString()).toBe("First edit. Second edit. ");

    docA.destroy();
    docB.destroy();
  });

  test("applying duplicate updates is idempotent", () => {
    const docA = createDoc();
    const docB = createDoc();

    const textA = docA.getText("content");
    textA.insert(0, "Hello");

    const update = Y.encodeStateAsUpdate(docA);

    // Apply the same update multiple times
    Y.applyUpdate(docB, update);
    Y.applyUpdate(docB, update);
    Y.applyUpdate(docB, update);

    const textB = docB.getText("content");
    expect(textB.toString()).toBe("Hello");

    docA.destroy();
    docB.destroy();
  });

  test("snapshot and restore preserves document state", () => {
    const doc = new Y.Doc({ gc: false });
    const text = doc.getText("doc");

    text.insert(0, "Snapshot this");
    const snapshot = Y.snapshot(doc);

    text.insert(text.length, " plus more");
    expect(text.toString()).toBe("Snapshot this plus more");

    // Restore from snapshot via encodeSnapshotV2 -> new doc
    const snapshotDoc = Y.createDocFromSnapshot(doc, snapshot);
    const restoredText = snapshotDoc.getText("doc");
    expect(restoredText.toString()).toBe("Snapshot this");

    snapshotDoc.destroy();
    doc.destroy();
  });
});

// ── Text operations ─────────────────────────────────────────────────

describe("text operations", () => {
  let doc: Y.Doc;
  let text: Y.Text;

  beforeEach(() => {
    doc = createDoc();
    text = doc.getText("text");
  });

  afterEach(() => {
    doc.destroy();
  });

  test("insert at beginning", () => {
    text.insert(0, "World");
    text.insert(0, "Hello ");
    expect(text.toString()).toBe("Hello World");
  });

  test("insert at end", () => {
    text.insert(0, "Hello");
    text.insert(5, " World");
    expect(text.toString()).toBe("Hello World");
  });

  test("insert in middle", () => {
    text.insert(0, "Helo");
    text.insert(2, "l");
    expect(text.toString()).toBe("Hello");
  });

  test("delete range", () => {
    text.insert(0, "Hello World");
    text.delete(5, 6); // delete " World"
    expect(text.toString()).toBe("Hello");
  });

  test("delete from beginning", () => {
    text.insert(0, "Hello World");
    text.delete(0, 6); // delete "Hello "
    expect(text.toString()).toBe("World");
  });

  test("format applies attributes to range", () => {
    text.insert(0, "Hello World");
    text.format(0, 5, { bold: true });

    const delta = text.toDelta();
    expect(delta[0]).toEqual({
      insert: "Hello",
      attributes: { bold: true },
    });
    expect(delta[1]).toEqual({ insert: " World" });
  });

  test("multiple formats on overlapping ranges", () => {
    text.insert(0, "Hello World");
    text.format(0, 5, { bold: true });
    text.format(3, 5, { italic: true }); // "lo Wo"

    const delta = text.toDelta();
    // "Hel" = bold, "lo" = bold+italic, " Wo" = italic, "rld" = plain
    expect(delta.length).toBeGreaterThanOrEqual(3);
  });

  test("observe fires on text change", () => {
    const events: Y.YTextEvent[] = [];
    text.observe((event) => {
      events.push(event);
    });

    text.insert(0, "test");
    expect(events.length).toBe(1);
    expect(events[0]?.target).toBe(text);
  });

  test("toJSON returns plain string", () => {
    text.insert(0, "Simple text");
    expect(text.toJSON()).toBe("Simple text");
  });
});

// ── Map operations ──────────────────────────────────────────────────

describe("map operations", () => {
  let doc: Y.Doc;
  let map: Y.Map<unknown>;

  beforeEach(() => {
    doc = createDoc();
    map = doc.getMap("state");
  });

  afterEach(() => {
    doc.destroy();
  });

  test("set and get string value", () => {
    map.set("key", "value");
    expect(map.get("key")).toBe("value");
  });

  test("set and get number value", () => {
    map.set("count", 42);
    expect(map.get("count")).toBe(42);
  });

  test("set and get boolean value", () => {
    map.set("active", true);
    expect(map.get("active")).toBe(true);
  });

  test("set nested Y.Map", () => {
    const nested = new Y.Map<string>();
    map.set("nested", nested);
    nested.set("inner", "value");

    const retrieved = map.get("nested") as Y.Map<string>;
    expect(retrieved.get("inner")).toBe("value");
  });

  test("delete removes key", () => {
    map.set("temp", "data");
    expect(map.has("temp")).toBe(true);

    map.delete("temp");
    expect(map.has("temp")).toBe(false);
    expect(map.get("temp")).toBeUndefined();
  });

  test("has returns correct boolean", () => {
    expect(map.has("missing")).toBe(false);
    map.set("present", "yes");
    expect(map.has("present")).toBe(true);
  });

  test("size tracks entry count", () => {
    expect(map.size).toBe(0);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.size).toBe(2);
    map.delete("a");
    expect(map.size).toBe(1);
  });

  test("toJSON returns plain object", () => {
    map.set("name", "test");
    map.set("count", 5);
    expect(map.toJSON()).toEqual({ name: "test", count: 5 });
  });

  test("observe fires on map changes", () => {
    const events: Y.YMapEvent<unknown>[] = [];
    map.observe((event) => {
      events.push(event);
    });

    map.set("key", "value");
    expect(events.length).toBe(1);

    map.set("key", "updated");
    expect(events.length).toBe(2);
  });
});

// ── Array operations ────────────────────────────────────────────────

describe("array operations", () => {
  let doc: Y.Doc;
  let arr: Y.Array<string>;

  beforeEach(() => {
    doc = createDoc();
    arr = doc.getArray("list");
  });

  afterEach(() => {
    doc.destroy();
  });

  test("push appends items", () => {
    arr.push(["a", "b", "c"]);
    expect(arr.toJSON()).toEqual(["a", "b", "c"]);
  });

  test("unshift prepends items", () => {
    arr.push(["b", "c"]);
    arr.unshift(["a"]);
    expect(arr.toJSON()).toEqual(["a", "b", "c"]);
  });

  test("insert at index", () => {
    arr.push(["a", "c"]);
    arr.insert(1, ["b"]);
    expect(arr.toJSON()).toEqual(["a", "b", "c"]);
  });

  test("delete at index", () => {
    arr.push(["a", "b", "c"]);
    arr.delete(1, 1);
    expect(arr.toJSON()).toEqual(["a", "c"]);
  });

  test("get retrieves item by index", () => {
    arr.push(["x", "y", "z"]);
    expect(arr.get(0)).toBe("x");
    expect(arr.get(1)).toBe("y");
    expect(arr.get(2)).toBe("z");
  });

  test("length tracks array size", () => {
    expect(arr.length).toBe(0);
    arr.push(["a"]);
    expect(arr.length).toBe(1);
    arr.push(["b", "c"]);
    expect(arr.length).toBe(3);
    arr.delete(0, 1);
    expect(arr.length).toBe(2);
  });

  test("slice returns sub-array", () => {
    arr.push(["a", "b", "c", "d"]);
    expect(arr.slice(1, 3)).toEqual(["b", "c"]);
  });

  test("toJSON returns plain array", () => {
    arr.push(["one", "two"]);
    const json = arr.toJSON();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toEqual(["one", "two"]);
  });

  test("observe fires on array mutations", () => {
    const events: Y.YArrayEvent<string>[] = [];
    arr.observe((event) => {
      events.push(event);
    });

    arr.push(["item"]);
    expect(events.length).toBe(1);

    arr.delete(0, 1);
    expect(events.length).toBe(2);
  });

  test("nested Y.Map inside array", () => {
    const mixedArr = doc.getArray<Y.Map<string>>("mixed");
    const item = new Y.Map<string>();
    mixedArr.push([item]);
    item.set("name", "test");

    const retrieved = mixedArr.get(0);
    expect(retrieved.get("name")).toBe("test");
  });
});

// ── Transaction batching ────────────────────────────────────────────

describe("transaction batching", () => {
  test("transact groups multiple operations into one update", () => {
    const doc = createDoc();
    const text = doc.getText("t");
    const map = doc.getMap<number>("m");

    let updateCount = 0;
    doc.on("update", () => {
      updateCount++;
    });

    doc.transact(() => {
      text.insert(0, "Hello");
      map.set("version", 1);
    });

    // A single transaction should emit one update
    expect(updateCount).toBe(1);
    expect(text.toString()).toBe("Hello");
    expect(map.get("version")).toBe(1);

    doc.destroy();
  });

  test("nested transact calls are flattened", () => {
    const doc = createDoc();
    const arr = doc.getArray<string>("a");

    let updateCount = 0;
    doc.on("update", () => {
      updateCount++;
    });

    doc.transact(() => {
      arr.push(["first"]);
      doc.transact(() => {
        arr.push(["second"]);
      });
    });

    expect(updateCount).toBe(1);
    expect(arr.toJSON()).toEqual(["first", "second"]);

    doc.destroy();
  });
});
