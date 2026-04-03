// ── LangGraph Agent Orchestration ────────────────────────────────
// StateGraph for multi-step AI workflows with planner -> executor ->
// reviewer -> responder pipeline. Supports conditional edges for
// retry and replan flows.
//
// NOTE: This module provides a LangGraph-style state graph using a
// lightweight custom implementation. The architecture matches the
// LangGraph StateGraph pattern (nodes, edges, conditional routing)
// so migration to @langchain/langgraph is a drop-in swap when desired.

import { plannerNode } from "./nodes/planner";
import { executorNode } from "./nodes/executor";
import { reviewerNode } from "./nodes/reviewer";
import { responderNode } from "./nodes/responder";
import {
  AgentStateSchema,
  type AgentState,
  type AgentConfig,
  type AgentEvent,
} from "./types";

// ── Graph Node Type ─────────────────────────────────────────────

type NodeFn = (
  state: AgentState,
  config: AgentConfig,
) => Promise<Partial<AgentState>>;

type EdgeRouter = (state: AgentState) => string;

interface GraphNode {
  name: string;
  fn: NodeFn;
}

interface ConditionalEdge {
  from: string;
  router: EdgeRouter;
}

interface StaticEdge {
  from: string;
  to: string;
}

// ── StateGraph Builder ──────────────────────────────────────────

class StateGraph {
  private nodes = new Map<string, GraphNode>();
  private staticEdges: StaticEdge[] = [];
  private conditionalEdges: ConditionalEdge[] = [];
  private entryPoint: string | null = null;

  addNode(name: string, fn: NodeFn): this {
    this.nodes.set(name, { name, fn });
    return this;
  }

  addEdge(from: string, to: string): this {
    this.staticEdges.push({ from, to });
    return this;
  }

  addConditionalEdge(from: string, router: EdgeRouter): this {
    this.conditionalEdges.push({ from, router });
    return this;
  }

  setEntryPoint(name: string): this {
    this.entryPoint = name;
    return this;
  }

  compile(): CompiledGraph {
    if (!this.entryPoint) {
      throw new Error("StateGraph: entry point not set");
    }

    return new CompiledGraph(
      this.nodes,
      this.staticEdges,
      this.conditionalEdges,
      this.entryPoint,
    );
  }
}

// ── Compiled Graph (Executable) ─────────────────────────────────

const END = "__end__";
const MAX_ITERATIONS = 20;

class CompiledGraph {
  constructor(
    private nodes: Map<string, GraphNode>,
    private staticEdges: StaticEdge[],
    private conditionalEdges: ConditionalEdge[],
    private entryPoint: string,
  ) {}

  /**
   * Run the graph to completion, starting from the entry point.
   * Applies state updates from each node and follows edges.
   */
  async invoke(
    initialState: AgentState,
    config: AgentConfig,
  ): Promise<AgentState> {
    let state = { ...initialState };
    let currentNode = this.entryPoint;
    let iterations = 0;

    while (currentNode !== END && iterations < MAX_ITERATIONS) {
      iterations++;

      const node = this.nodes.get(currentNode);
      if (!node) {
        throw new Error(`StateGraph: unknown node "${currentNode}"`);
      }

      // Check timeout
      if (config.timeoutMs) {
        const elapsed =
          Date.now() -
          (typeof state.metadata["startTime"] === "number"
            ? state.metadata["startTime"]
            : Date.now());
        if (elapsed > config.timeoutMs) {
          state = {
            ...state,
            currentStep: "error",
            errors: [
              ...state.errors,
              `Timeout exceeded: ${config.timeoutMs}ms`,
            ],
          };
          break;
        }
      }

      // Execute node
      const update = await node.fn(state, config);
      state = mergeState(state, update);

      // Resolve next node
      currentNode = this.resolveNext(currentNode, state);
    }

    if (iterations >= MAX_ITERATIONS) {
      state = {
        ...state,
        currentStep: "error",
        errors: [
          ...state.errors,
          `Max iterations (${MAX_ITERATIONS}) exceeded`,
        ],
      };
    }

    return state;
  }

  /**
   * Run the graph and yield AgentEvents as an async iterable.
   * Wraps invoke() with an event collector.
   */
  async *stream(
    initialState: AgentState,
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const events: AgentEvent[] = [];
    let resolveWaiter: (() => void) | null = null;
    let done = false;

    const wrappedConfig: AgentConfig = {
      ...config,
      onEvent: (event: AgentEvent) => {
        events.push(event);
        config.onEvent?.(event);
        resolveWaiter?.();
      },
    };

    // Run graph in background
    const graphPromise = this.invoke(initialState, wrappedConfig).then(
      (finalState) => {
        done = true;
        // Ensure a complete event exists
        const hasComplete = events.some((e) => e.type === "complete");
        if (!hasComplete) {
          const completeEvent: AgentEvent = {
            type: "complete",
            finalOutput: finalState.output ?? null,
            timestamp: Date.now(),
          };
          events.push(completeEvent);
        }
        resolveWaiter?.();
        return finalState;
      },
    );

    // Yield events as they arrive
    let yielded = 0;
    while (!done || yielded < events.length) {
      if (yielded < events.length) {
        yield events[yielded]!;
        yielded++;
      } else {
        // Wait for next event
        await new Promise<void>((resolve) => {
          resolveWaiter = resolve;
        });
      }
    }

    // Yield any remaining events
    while (yielded < events.length) {
      yield events[yielded]!;
      yielded++;
    }

    // Ensure the graph promise resolves (error propagation)
    await graphPromise;
  }

  private resolveNext(currentNode: string, state: AgentState): string {
    // Check conditional edges first
    const conditional = this.conditionalEdges.find(
      (e) => e.from === currentNode,
    );
    if (conditional) {
      return conditional.router(state);
    }

    // Check static edges
    const staticEdge = this.staticEdges.find((e) => e.from === currentNode);
    if (staticEdge) {
      return staticEdge.to;
    }

    // No edge found -- end
    return END;
  }
}

// ── State Merge Helper ──────────────────────────────────────────

function mergeState(
  current: AgentState,
  update: Partial<AgentState>,
): AgentState {
  return {
    ...current,
    ...update,
    messages: update.messages ?? current.messages,
    results: update.results ?? current.results,
    errors: update.errors ?? current.errors,
    metadata: {
      ...current.metadata,
      ...(update.metadata ?? {}),
    },
  };
}

// ── Router Functions ────────────────────────────────────────────

function reviewRouter(state: AgentState): string {
  switch (state.currentStep) {
    case "responding":
      return "responder";
    case "executing":
      return "executor";
    case "planning":
      return "planner";
    default:
      return "responder";
  }
}

// ── Graph Factory ───────────────────────────────────────────────

export interface AgentGraphOptions {
  /** Custom nodes to override defaults */
  overrideNodes?: Partial<Record<"planner" | "executor" | "reviewer" | "responder", NodeFn>>;
}

/**
 * Creates the default Cronix agent graph.
 *
 * Flow:
 *   planner -> executor -> reviewer --(conditional)--> responder | executor | planner
 *
 * The reviewer decides whether to accept (-> responder), retry (-> executor),
 * or replan (-> planner) based on result quality.
 */
export function createAgentGraph(options?: AgentGraphOptions): CompiledGraph {
  const graph = new StateGraph();

  graph
    .addNode("planner", options?.overrideNodes?.planner ?? plannerNode)
    .addNode("executor", options?.overrideNodes?.executor ?? executorNode)
    .addNode("reviewer", options?.overrideNodes?.reviewer ?? reviewerNode)
    .addNode("responder", options?.overrideNodes?.responder ?? responderNode)
    .addEdge("planner", "executor")
    .addEdge("executor", "reviewer")
    .addConditionalEdge("reviewer", reviewRouter)
    .setEntryPoint("planner");

  return graph.compile();
}

// ── Convenience: Create Initial State ───────────────────────────

export function createInitialState(
  userMessage: string,
  metadata?: Record<string, unknown>,
): AgentState {
  const state: AgentState = {
    messages: [{ role: "user", content: userMessage }],
    currentStep: "planning",
    plan: null,
    results: [],
    errors: [],
    metadata: { startTime: Date.now(), ...metadata },
    review: null,
    retryCount: 0,
    maxRetries: 2,
    output: null,
  };

  // Validate at boundary
  return AgentStateSchema.parse(state);
}

// ── Re-exports ──────────────────────────────────────────────────

export { StateGraph, CompiledGraph, END };
export type { NodeFn, EdgeRouter };
