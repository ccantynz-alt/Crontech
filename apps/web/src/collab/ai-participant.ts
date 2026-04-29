// ── AI Agent as Collaboration Participant ────────────────────────────
// AI agents participate in real-time editing sessions as first-class
// collaborators. They hold cursors, make selections, and edit alongside
// human users via the same Yjs CRDT primitives.

import type { CollabRoom, CollabUser } from "./yjs-provider";
import {
  createCollabRoom,
  getRandomColor,
  getSharedMap,
  getSharedText,
  projectRoomId,
  updateCursorPosition,
} from "./yjs-provider";

// ── Types ────────────────────────────────────────────────────────────

export interface AIParticipantConfig {
  /** AI agent identity */
  agent: CollabUser;
  /** The collaboration room to join */
  room: CollabRoom;
  /** Callback to generate AI content based on current state */
  onGenerateContent?: (context: AIEditContext) => Promise<string>;
}

export interface AIEditContext {
  /** Current full text of the shared document */
  currentText: string;
  /** The specific section the AI is editing */
  editRange?: { start: number; end: number };
  /** Instruction from a human collaborator */
  instruction?: string;
}

export interface AIParticipant {
  /** Insert text at a position in the shared document */
  insertText(text: string, position: number, field?: string): void;
  /** Delete text in the shared document */
  deleteText(position: number, length: number, field?: string): void;
  /** Replace a range of text */
  replaceText(start: number, end: number, newText: string, field?: string): void;
  /** Set a value in the shared state map */
  setState(key: string, value: unknown): void;
  /** Move the AI cursor to simulate presence */
  moveCursor(x: number, y: number): void;
  /** Process an instruction from a human collaborator */
  processInstruction(instruction: string, field?: string): Promise<string>;
  /** Disconnect the AI agent */
  disconnect(): void;
}

// ── AI Participant Factory ───────────────────────────────────────────

export function createAIParticipant(config: AIParticipantConfig): AIParticipant {
  const { room, agent } = config;
  const { doc, awareness } = room;

  // Set AI presence in awareness
  awareness.setLocalStateField("user", {
    ...agent,
    isAI: true,
  });

  return {
    insertText(text: string, position: number, field = "content") {
      const yText = getSharedText(doc, field);
      yText.insert(position, text);
    },

    deleteText(position: number, length: number, field = "content") {
      const yText = getSharedText(doc, field);
      yText.delete(position, length);
    },

    replaceText(start: number, end: number, newText: string, field = "content") {
      const yText = getSharedText(doc, field);
      doc.transact(() => {
        yText.delete(start, end - start);
        yText.insert(start, newText);
      });
    },

    setState(key: string, value: unknown) {
      const yMap = getSharedMap(doc, "state");
      yMap.set(key, value);
    },

    moveCursor(x: number, y: number) {
      updateCursorPosition(awareness, { x, y });
    },

    async processInstruction(instruction: string, field = "content") {
      const yText = getSharedText(doc, field);
      const currentText = yText.toString();

      if (config.onGenerateContent) {
        const generated = await config.onGenerateContent({
          currentText,
          instruction,
        });

        // Apply the AI's edit as a transaction
        doc.transact(() => {
          // Append generated content at the end
          yText.insert(yText.length, generated);
        });

        return generated;
      }

      return "";
    },

    disconnect() {
      awareness.setLocalState(null);
    },
  };
}

// ── Convenience: join an AI agent to a project collab room ──────────

export interface JoinedAIParticipant {
  /** The AI participant handle. */
  participant: AIParticipant;
  /** The underlying collab room. Must be destroyed on cleanup. */
  room: CollabRoom;
  /** Tear down the AI connection (awareness + room + doc). */
  disconnect(): void;
}

export interface JoinAsParticipantOptions {
  /** Override the generated display name for the agent. */
  displayName?: string;
  /** Override the auto-picked avatar color. */
  color?: string;
  /** Override the default collab server URL (used only in tests). */
  serverUrl?: string;
}

/**
 * Registers an AI agent as a first-class collaboration peer on a
 * project's collab room. This creates a *separate* Yjs connection for
 * the AI so its awareness entry appears alongside the human user's.
 *
 * The returned handle must be `disconnect()`-ed during cleanup to avoid
 * ghost participants and ws leaks.
 *
 * @param docId  The project id (NOT the room id). The room id is derived
 *               deterministically via `projectRoomId(docId)` so the web
 *               client and server stay in sync.
 * @param agentId Stable identifier for the AI agent (e.g. "builder-agent").
 */
export function joinAsParticipant(
  docId: string,
  agentId: string,
  options: JoinAsParticipantOptions = {},
): JoinedAIParticipant {
  const roomId = projectRoomId(docId);
  const color = options.color ?? getRandomColor();
  const displayName = options.displayName ?? humanizeAgentId(agentId);

  const agent: CollabUser = {
    id: agentId,
    name: displayName,
    color,
    isAI: true,
  };

  const roomConfig: Parameters<typeof createCollabRoom>[0] = {
    roomId,
    user: agent,
    ...(options.serverUrl !== undefined ? { serverUrl: options.serverUrl } : {}),
  };
  const room = createCollabRoom(roomConfig);

  const participant = createAIParticipant({ agent, room });

  return {
    participant,
    room,
    disconnect() {
      participant.disconnect();
      room.destroy();
    },
  };
}

function humanizeAgentId(agentId: string): string {
  // "builder-agent" → "Builder Agent"
  return agentId
    .split(/[-_]/g)
    .filter((w) => w.length > 0)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
