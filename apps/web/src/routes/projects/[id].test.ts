// ── BLK-011 — /projects/:id Collab Wiring Tests ─────────────────────
//
// Three tests cover the contract this page promises:
//
//   1. Connection-lifecycle — the effect creates a `CollabRoom` on
//      mount and disconnects it on unmount (no ws leak). We verify the
//      tsx source contains both the `createCollabRoom(...)` call AND an
//      `onCleanup(...)` that destroys it, which is the shape the
//      runtime code ships. A full Solid render harness isn't available
//      in this package's test env (no JSDOM), so we pin the source
//      contract instead of the render tree.
//
//   2. Presence-rendering — the pure `summarizePresence` reducer is
//      the entire rendering contract for `<CollabPresence />`. We test
//      it directly so any regression in "N humans + M AI agents" or
//      self-exclusion trips this suite.
//
//   3. AI-participant-registration — `joinAsParticipant(docId, agentId)`
//      must return a handle AND register the agent's awareness state
//      under the same room. We exercise the inner factory with a fake
//      `CollabRoom` (real `Y.Doc` + real `Awareness`) so we never open
//      a WebSocket during the test.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";

import { summarizePresence, getInitials } from "../../components/CollabPresence";
import {
  createAIParticipant,
  joinAsParticipant,
} from "../../collab/ai-participant";
import type { CollabRoom, CollabUser } from "../../collab/yjs-provider";
import { projectRoomId } from "../../collab/yjs-provider";

// ── Test Helpers ────────────────────────────────────────────────────

const ROUTE_FILE = resolve(import.meta.dir, "[id].tsx");

function readRouteSource(): string {
  return readFileSync(ROUTE_FILE, "utf-8");
}

/**
 * A fully in-memory `CollabRoom` that avoids any WebSocket. The real
 * `createCollabRoom` opens a ws to the edge yjs server; for unit tests
 * we only need the doc + awareness contract, so we build a minimal
 * awareness stub that implements the three methods `createAIParticipant`
 * actually calls: `setLocalStateField`, `setLocalState`, `getLocalState`.
 */
interface FakeAwareness {
  setLocalStateField(field: string, value: unknown): void;
  setLocalState(state: Record<string, unknown> | null): void;
  getLocalState(): Record<string, unknown> | null;
}

function makeFakeAwareness(): FakeAwareness {
  let state: Record<string, unknown> | null = {};
  return {
    setLocalStateField(field, value) {
      if (state === null) state = {};
      state[field] = value;
    },
    setLocalState(next) {
      state = next;
    },
    getLocalState() {
      return state;
    },
  };
}

function makeFakeRoom(): { room: CollabRoom; awareness: FakeAwareness } {
  const doc = new Y.Doc();
  const awareness = makeFakeAwareness();
  const room: CollabRoom = {
    doc,
    // `provider` is typed on CollabRoom but createAIParticipant never
    // touches it — cast keeps the type system honest without dragging
    // in a fake WebsocketProvider.
    provider: undefined as never,
    awareness: awareness as unknown as CollabRoom["awareness"],
    destroy() {
      doc.destroy();
    },
  };
  return { room, awareness };
}

// ── 1. Connection-lifecycle ──────────────────────────────────────────

describe("projects/[id] — collab connection lifecycle", () => {
  test("source wires createCollabRoom, joinAsParticipant, and onCleanup", () => {
    const src = readRouteSource();

    // Mount side: room + AI agent are both created.
    expect(src).toContain("createCollabRoom(");
    expect(src).toContain("joinAsParticipant(");

    // Unmount side: onCleanup tears both down.
    expect(src).toContain("onCleanup(");
    expect(src).toContain("room.destroy()");
    expect(src).toContain("aiParticipant?.disconnect()");

    // Room id must be derived via the shared helper so server auth and
    // the client WS url stay aligned.
    expect(src).toContain("projectRoomId(");
  });

  test("effect is SSR-safe — guards on `typeof window`", () => {
    const src = readRouteSource();
    // y-websocket can't run on the server; the effect must bail early.
    expect(src).toContain('typeof window === "undefined"');
  });

  test("room signal is cleared on cleanup so CollabPresence re-idles", () => {
    const src = readRouteSource();
    expect(src).toContain("setCollabRoom(null)");
  });
});

// ── 2. Presence-rendering ────────────────────────────────────────────

describe("projects/[id] — CollabPresence summary model", () => {
  const self: CollabUser = {
    id: "user-self",
    name: "Craig",
    color: "#FF6B6B",
  };

  test("excludes the current user from the chip row", () => {
    const summary = summarizePresence([self], self.id);
    expect(summary.humans).toBe(0);
    expect(summary.agents).toBe(0);
    expect(summary.chips).toHaveLength(0);
  });

  test("counts humans and AI agents separately", () => {
    const users: CollabUser[] = [
      self,
      { id: "u1", name: "Alice Example", color: "#4ECDC4" },
      { id: "u2", name: "Bob Jones", color: "#45B7D1" },
      { id: "ai1", name: "Builder Agent", color: "#96CEB4", isAI: true },
    ];
    const summary = summarizePresence(users, self.id);
    expect(summary.humans).toBe(2);
    expect(summary.agents).toBe(1);
    expect(summary.chips).toHaveLength(3);

    const agentChip = summary.chips.find((c) => c.key === "ai1");
    expect(agentChip?.isAI).toBe(true);
    expect(agentChip?.initials).toBe("BA");
  });

  test("dedupes duplicate awareness entries for the same user id", () => {
    const users: CollabUser[] = [
      { id: "u1", name: "Alice", color: "#4ECDC4" },
      { id: "u1", name: "Alice", color: "#4ECDC4" },
    ];
    const summary = summarizePresence(users, self.id);
    expect(summary.humans).toBe(1);
    expect(summary.chips).toHaveLength(1);
  });

  test("getInitials derives up to two uppercase letters", () => {
    expect(getInitials("Alice Example")).toBe("AE");
    expect(getInitials("alice example")).toBe("AE");
    expect(getInitials("Cher")).toBe("C");
    expect(getInitials("Jean-Luc Picard Beta")).toBe("JP");
  });

  test("route renders <CollabPresence /> with the live room and user id", () => {
    const src = readRouteSource();
    expect(src).toContain("<CollabPresence");
    expect(src).toContain("room={collabRoom()}");
    expect(src).toContain("currentUserId={currentUserId()}");
  });
});

// ── 3. AI-participant-registration ───────────────────────────────────

describe("projects/[id] — default AI agent registers in the room", () => {
  test("createAIParticipant writes agent state into awareness.user", () => {
    const { room, awareness } = makeFakeRoom();
    const agent: CollabUser = {
      id: "builder-agent",
      name: "Builder Agent",
      color: "#96CEB4",
      isAI: true,
    };

    const participant = createAIParticipant({ agent, room });
    const localState = awareness.getLocalState();
    expect(localState).not.toBeNull();
    const user = (localState as Record<string, unknown>)["user"] as CollabUser;
    expect(user.id).toBe("builder-agent");
    expect(user.name).toBe("Builder Agent");
    expect(user.isAI).toBe(true);

    // Tearing down clears the awareness slot so the chip row goes idle.
    participant.disconnect();
    expect(awareness.getLocalState()).toBeNull();

    room.destroy();
  });

  test("route wires the builder-agent constant through joinAsParticipant", () => {
    const src = readRouteSource();
    expect(src).toContain('"builder-agent"');
    expect(src).toContain("DEFAULT_PROJECT_AI_AGENT_ID");
    expect(src).toContain("DEFAULT_PROJECT_AI_AGENT_NAME");
  });

  test("joinAsParticipant + projectRoomId share the editor's roomId convention", () => {
    // We only assert the derived room id — exercising the real join
    // would open a y-websocket connection, which we explicitly avoid
    // in unit tests.
    expect(projectRoomId("proj_123")).toBe("projects:proj_123");
    // The exported factory is the handle the page imports.
    expect(typeof joinAsParticipant).toBe("function");
  });
});
