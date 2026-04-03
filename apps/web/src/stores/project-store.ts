// ── Project / Builder State Store ────────────────────────────────────
// SolidJS signal-based store for the website/video builder workspace.
// Manages the component tree, undo/redo, collaboration, and AI agents.

import { createRoot, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";

// ── Types ────────────────────────────────────────────────────────────

export interface ComponentNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: ComponentNode[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectData {
  meta: ProjectMeta | null;
  rootComponent: ComponentNode | null;
  dirty: boolean;
}

export type AgentStatus = "idle" | "thinking" | "acting" | "error";

export interface AIAgent {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask: string;
  lastError: string;
}

export interface CollaborationParticipant {
  id: string;
  displayName: string;
  color: string;
  isAI: boolean;
  cursorNodeId: string;
}

/** A snapshot of the component tree for undo/redo. */
interface HistoryEntry {
  tree: ComponentNode | null;
  timestamp: number;
  label: string;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_PROJECT: ProjectData = {
  meta: null,
  rootComponent: null,
  dirty: false,
};

const MAX_UNDO_HISTORY = 100;

// ── ID Generation ────────────────────────────────────────────────────

let nodeCounter = 0;

function generateNodeId(): string {
  nodeCounter += 1;
  return `node_${Date.now()}_${String(nodeCounter)}`;
}

// ── Tree Utilities ───────────────────────────────────────────────────

/** Deep-clone a component tree (for history snapshots). */
function cloneTree(node: ComponentNode | null): ComponentNode | null {
  if (!node) return null;
  return {
    id: node.id,
    type: node.type,
    props: structuredClone(node.props),
    children: node.children.map((child) => cloneTree(child)!),
  };
}

/** Find a node by ID in a tree. Returns null if not found. */
function findNode(
  root: ComponentNode | null,
  id: string,
): ComponentNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Remove a node by ID from its parent's children. Returns true if removed. */
function removeNodeFromTree(
  root: ComponentNode,
  id: string,
): boolean {
  const idx = root.children.findIndex((c) => c.id === id);
  if (idx !== -1) {
    root.children.splice(idx, 1);
    return true;
  }
  for (const child of root.children) {
    if (removeNodeFromTree(child, id)) return true;
  }
  return false;
}

// ── Store Factory ────────────────────────────────────────────────────

function createProjectStore() {
  // ── Project Data ─────────────────────────────────────────────────
  const [project, setProject] = createStore<ProjectData>({
    ...DEFAULT_PROJECT,
  });

  // ── Selection ────────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);

  // ── Undo / Redo ──────────────────────────────────────────────────
  const [undoStack, setUndoStack] = createSignal<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = createSignal<HistoryEntry[]>([]);

  const canUndo = (): boolean => undoStack().length > 0;
  const canRedo = (): boolean => redoStack().length > 0;

  function pushHistory(label: string): void {
    const entry: HistoryEntry = {
      tree: cloneTree(project.rootComponent),
      timestamp: Date.now(),
      label,
    };
    setUndoStack((prev) => {
      const next = [...prev, entry];
      if (next.length > MAX_UNDO_HISTORY) {
        return next.slice(next.length - MAX_UNDO_HISTORY);
      }
      return next;
    });
    // Any new action clears the redo stack
    setRedoStack([]);
  }

  function undo(): void {
    const stack = undoStack();
    if (stack.length === 0) return;

    const entry = stack[stack.length - 1]!;
    const currentSnapshot: HistoryEntry = {
      tree: cloneTree(project.rootComponent),
      timestamp: Date.now(),
      label: "redo",
    };

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentSnapshot]);
    setProject("rootComponent", cloneTree(entry.tree));
    setProject("dirty", true);
  }

  function redo(): void {
    const stack = redoStack();
    if (stack.length === 0) return;

    const entry = stack[stack.length - 1]!;
    const currentSnapshot: HistoryEntry = {
      tree: cloneTree(project.rootComponent),
      timestamp: Date.now(),
      label: "undo",
    };

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, currentSnapshot]);
    setProject("rootComponent", cloneTree(entry.tree));
    setProject("dirty", true);
  }

  // ── Collaboration ────────────────────────────────────────────────
  const [participants, setParticipants] = createStore<CollaborationParticipant[]>([]);

  // ── AI Agents ────────────────────────────────────────────────────
  const [agents, setAgents] = createStore<AIAgent[]>([]);

  // ── Project Actions ──────────────────────────────────────────────

  function loadProject(meta: ProjectMeta, rootComponent: ComponentNode | null): void {
    setProject({
      meta,
      rootComponent: rootComponent ? cloneTree(rootComponent) : null,
      dirty: false,
    });
    setSelectedNodeId(null);
    setUndoStack([]);
    setRedoStack([]);
  }

  function closeProject(): void {
    setProject({ ...DEFAULT_PROJECT });
    setSelectedNodeId(null);
    setUndoStack([]);
    setRedoStack([]);
    setParticipants([]);
    setAgents([]);
  }

  function markSaved(): void {
    setProject("dirty", false);
  }

  // ── Component Tree Actions ───────────────────────────────────────

  function addNode(
    parentId: string | null,
    type: string,
    props: Record<string, unknown> = {},
    index?: number,
  ): string {
    pushHistory(`add ${type}`);

    const newNode: ComponentNode = {
      id: generateNodeId(),
      type,
      props,
      children: [],
    };

    if (!parentId) {
      // Set as root
      setProject("rootComponent", newNode);
    } else {
      setProject(
        "rootComponent",
        produce((root) => {
          if (!root) return;
          const parent = findNode(root, parentId);
          if (!parent) return;
          if (index !== undefined && index >= 0 && index <= parent.children.length) {
            parent.children.splice(index, 0, newNode);
          } else {
            parent.children.push(newNode);
          }
        })!,
      );
    }

    setProject("dirty", true);
    return newNode.id;
  }

  function removeNode(nodeId: string): void {
    if (!project.rootComponent) return;

    // Cannot remove root -- close project instead
    if (project.rootComponent.id === nodeId) {
      pushHistory("remove root");
      setProject("rootComponent", null);
      setProject("dirty", true);
      setSelectedNodeId(null);
      return;
    }

    pushHistory("remove node");
    setProject(
      "rootComponent",
      produce((root) => {
        if (!root) return;
        removeNodeFromTree(root, nodeId);
      })!,
    );
    setProject("dirty", true);

    // Deselect if the removed node was selected
    if (selectedNodeId() === nodeId) {
      setSelectedNodeId(null);
    }
  }

  function updateNodeProps(
    nodeId: string,
    propsUpdate: Record<string, unknown>,
  ): void {
    pushHistory("update props");
    setProject(
      "rootComponent",
      produce((root) => {
        if (!root) return;
        const node = findNode(root, nodeId);
        if (!node) return;
        Object.assign(node.props, propsUpdate);
      })!,
    );
    setProject("dirty", true);
  }

  function moveNode(
    nodeId: string,
    newParentId: string,
    index?: number,
  ): void {
    if (!project.rootComponent) return;

    // Find the node to move (clone before removing)
    const nodeToMove = findNode(project.rootComponent, nodeId);
    if (!nodeToMove) return;
    const cloned = cloneTree(nodeToMove)!;

    pushHistory("move node");
    setProject(
      "rootComponent",
      produce((root) => {
        if (!root) return;
        // Remove from old position
        removeNodeFromTree(root, nodeId);
        // Insert at new position
        const newParent = findNode(root, newParentId);
        if (!newParent) return;
        if (index !== undefined && index >= 0 && index <= newParent.children.length) {
          newParent.children.splice(index, 0, cloned);
        } else {
          newParent.children.push(cloned);
        }
      })!,
    );
    setProject("dirty", true);
  }

  function replaceTree(rootComponent: ComponentNode | null, label: string = "replace tree"): void {
    pushHistory(label);
    setProject("rootComponent", rootComponent ? cloneTree(rootComponent) : null);
    setProject("dirty", true);
  }

  // ── Selection Actions ────────────────────────────────────────────

  function selectNode(nodeId: string | null): void {
    setSelectedNodeId(nodeId);
  }

  // ── Collaboration Actions ────────────────────────────────────────

  function setCollaborationParticipants(users: CollaborationParticipant[]): void {
    setParticipants(users);
  }

  function addParticipant(participant: CollaborationParticipant): void {
    setParticipants(
      produce((list) => {
        const idx = list.findIndex((p) => p.id === participant.id);
        if (idx !== -1) {
          list[idx] = participant;
        } else {
          list.push(participant);
        }
      }),
    );
  }

  function removeParticipant(participantId: string): void {
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
  }

  function updateParticipantCursor(participantId: string, nodeId: string): void {
    setParticipants(
      produce((list) => {
        const p = list.find((item) => item.id === participantId);
        if (p) {
          p.cursorNodeId = nodeId;
        }
      }),
    );
  }

  // ── AI Agent Actions ─────────────────────────────────────────────

  function registerAgent(agent: AIAgent): void {
    setAgents(
      produce((list) => {
        const idx = list.findIndex((a) => a.id === agent.id);
        if (idx !== -1) {
          list[idx] = agent;
        } else {
          list.push(agent);
        }
      }),
    );
  }

  function unregisterAgent(agentId: string): void {
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
  }

  function updateAgentStatus(
    agentId: string,
    status: AgentStatus,
    currentTask: string = "",
  ): void {
    setAgents(
      produce((list) => {
        const agent = list.find((a) => a.id === agentId);
        if (agent) {
          agent.status = status;
          agent.currentTask = currentTask;
          if (status !== "error") {
            agent.lastError = "";
          }
        }
      }),
    );
  }

  function setAgentError(agentId: string, error: string): void {
    setAgents(
      produce((list) => {
        const agent = list.find((a) => a.id === agentId);
        if (agent) {
          agent.status = "error";
          agent.lastError = error;
        }
      }),
    );
  }

  return {
    // ── Project Data ─────────────────────────────────────────────
    project,
    loadProject,
    closeProject,
    markSaved,

    // ── Component Tree ───────────────────────────────────────────
    addNode,
    removeNode,
    updateNodeProps,
    moveNode,
    replaceTree,

    // ── Selection ────────────────────────────────────────────────
    selectedNodeId,
    selectNode,

    // ── Undo / Redo ──────────────────────────────────────────────
    canUndo,
    canRedo,
    undo,
    redo,

    // ── Collaboration ────────────────────────────────────────────
    participants,
    setCollaborationParticipants,
    addParticipant,
    removeParticipant,
    updateParticipantCursor,

    // ── AI Agents ────────────────────────────────────────────────
    agents,
    registerAgent,
    unregisterAgent,
    updateAgentStatus,
    setAgentError,
  } as const;
}

// ── Singleton ────────────────────────────────────────────────────────

export type ProjectStore = ReturnType<typeof createProjectStore>;

let _projectStore: ProjectStore | undefined;

/**
 * Returns the global project store singleton.
 *
 * Creates the store inside a `createRoot` on first call so that effects
 * and subscriptions are properly owned and cleaned up.
 *
 * @example
 * ```ts
 * const proj = useProjectStore();
 * proj.loadProject(meta, tree);
 * proj.addNode(parentId, "Button", { label: "Click me" });
 * proj.undo();
 * ```
 */
export function useProjectStore(): ProjectStore {
  if (!_projectStore) {
    createRoot(() => {
      _projectStore = createProjectStore();
    });
  }
  return _projectStore!;
}
