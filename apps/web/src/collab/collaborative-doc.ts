// ── Collaborative Document Binding ───────────────────────────────────
// Binds a Yjs document to the builder's component tree.
// Provides undo/redo, awareness (cursors/presence), and change listeners.

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  createCollabRoom,
  getRandomColor,
  type CollabRoom,
} from "./yjs-provider";

// ── Types ────────────────────────────────────────────────────────────

export interface ComponentNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children?: ComponentNode[];
}

export interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
    isAI?: boolean;
  };
  cursor?: { x: number; y: number };
  editingComponent?: string | null;
  status?: "online" | "typing" | "idle";
  lastActive?: number;
}

// ── CollaborativeDocument ────────────────────────────────────────────

export class CollaborativeDocument {
  private doc: Y.Doc;
  private provider: WebsocketProvider;
  private undoManager: Y.UndoManager;
  private room: CollabRoom;
  private componentTree: Y.Array<unknown>;
  private sharedText: Y.Text;
  private changeCallbacks: Array<(tree: ComponentNode[]) => void> = [];
  private userId: string;
  private userName: string;
  private userColor: string;

  constructor(roomId: string, userId: string, userName: string) {
    this.userId = userId;
    this.userName = userName;
    this.userColor = getRandomColor();

    this.room = createCollabRoom({
      roomId,
      user: {
        id: userId,
        name: userName,
        color: this.userColor,
      },
    });

    this.doc = this.room.doc;
    this.provider = this.room.provider;
    this.componentTree = this.doc.getArray("componentTree");
    this.sharedText = this.doc.getText("content");

    this.undoManager = new Y.UndoManager(this.componentTree, {
      captureTimeout: 500,
    });

    // Listen for changes to the component tree
    this.componentTree.observeDeep(() => {
      const tree = this.getComponentTreeSnapshot();
      for (const cb of this.changeCallbacks) {
        cb(tree);
      }
    });
  }

  connect(): void {
    if (!this.provider.wsconnected) {
      this.provider.connect();
    }
    // Set initial awareness state
    this.room.awareness.setLocalStateField("user", {
      id: this.userId,
      name: this.userName,
      color: this.userColor,
      isAI: false,
    });
    this.room.awareness.setLocalStateField("status", "online");
    this.room.awareness.setLocalStateField("lastActive", Date.now());
  }

  disconnect(): void {
    this.room.awareness.setLocalState(null);
    this.provider.disconnect();
  }

  destroy(): void {
    this.changeCallbacks = [];
    this.undoManager.destroy();
    this.room.destroy();
  }

  getComponentTree(): Y.Array<unknown> {
    return this.componentTree;
  }

  getSharedText(): Y.Text {
    return this.sharedText;
  }

  getComponentTreeSnapshot(): ComponentNode[] {
    return this.componentTree.toJSON() as ComponentNode[];
  }

  updateComponent(index: number, component: ComponentNode): void {
    if (index < 0 || index >= this.componentTree.length) return;
    this.doc.transact(() => {
      this.componentTree.delete(index, 1);
      this.componentTree.insert(index, [component]);
    });
    this.setEditingComponent(component.id);
  }

  addComponent(component: ComponentNode): void {
    this.componentTree.push([component]);
  }

  removeComponent(index: number): void {
    if (index < 0 || index >= this.componentTree.length) return;
    this.componentTree.delete(index, 1);
  }

  getAwareness(): WebsocketProvider["awareness"] {
    return this.room.awareness;
  }

  getProvider(): WebsocketProvider {
    return this.provider;
  }

  getUserId(): string {
    return this.userId;
  }

  getUserColor(): string {
    return this.userColor;
  }

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }

  onChange(callback: (tree: ComponentNode[]) => void): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      this.changeCallbacks = this.changeCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ── Awareness helpers ────────────────────────────────────────────

  updateCursor(x: number, y: number): void {
    this.room.awareness.setLocalStateField("cursor", { x, y });
    this.room.awareness.setLocalStateField("lastActive", Date.now());
    this.room.awareness.setLocalStateField("status", "online");
  }

  setEditingComponent(componentId: string | null): void {
    this.room.awareness.setLocalStateField("editingComponent", componentId);
    this.room.awareness.setLocalStateField("lastActive", Date.now());
  }

  setStatus(status: "online" | "typing" | "idle"): void {
    this.room.awareness.setLocalStateField("status", status);
    this.room.awareness.setLocalStateField("lastActive", Date.now());
  }

  getAwarenessStates(): Map<number, AwarenessState> {
    return this.room.awareness.getStates() as Map<number, AwarenessState>;
  }

  getRemoteUsers(): AwarenessState[] {
    const states: AwarenessState[] = [];
    for (const [clientId, state] of this.getAwarenessStates()) {
      if (clientId === this.doc.clientID) continue;
      if (state.user) {
        states.push(state);
      }
    }
    return states;
  }

  onAwarenessChange(callback: () => void): () => void {
    const handler = (): void => {
      callback();
    };
    this.room.awareness.on("change", handler);
    return () => {
      this.room.awareness.off("change", handler);
    };
  }

  onConnectionStatus(callback: (connected: boolean) => void): () => void {
    const handler = (event: { status: string }): void => {
      callback(event.status === "connected");
    };
    this.provider.on("status", handler);
    return () => {
      this.provider.off("status", handler);
    };
  }
}
