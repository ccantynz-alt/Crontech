// ── AI Collaboration Agent Integration Tests ────────────────────────
// Tests that an AI agent can participate in a Yjs CRDT collaboration
// session: joining, making edits, and having those edits converge
// with human edits via standard CRDT synchronization.

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import * as Y from "yjs";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────

/** Schema for an AI-generated edit operation. */
const EditOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("insert"),
    sharedType: z.string(),
    index: z.number(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("delete"),
    sharedType: z.string(),
    index: z.number(),
    length: z.number(),
  }),
  z.object({
    type: z.literal("format"),
    sharedType: z.string(),
    index: z.number(),
    length: z.number(),
    attributes: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("mapSet"),
    sharedType: z.string(),
    key: z.string(),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal("arrayPush"),
    sharedType: z.string(),
    items: z.array(z.string()),
  }),
]);

type EditOperation = z.infer<typeof EditOperationSchema>;

/** Schema for the AI model's structured response. */
const AgentResponseSchema = z.object({
  reasoning: z.string(),
  operations: z.array(EditOperationSchema),
});

type AgentResponse = z.infer<typeof AgentResponseSchema>;

/** Configuration for the collaboration agent. */
interface CollabAgentConfig {
  agentName: string;
  agentColor: string;
  generateEdits: (context: AgentContext) => Promise<AgentResponse>;
}

/** Context passed to the AI model for generating edits. */
interface AgentContext {
  documentContent: string;
  sharedTypes: Record<string, string>;
  instruction: string;
}

// ── Collaboration Agent ─────────────────────────────────────────────

/**
 * A collaboration agent that applies AI-generated edits to a Yjs doc.
 * This simulates an AI agent participating as a CRDT peer.
 */
class CollabAgent {
  readonly doc: Y.Doc;
  readonly name: string;
  readonly color: string;
  private generateEdits: CollabAgentConfig["generateEdits"];

  constructor(doc: Y.Doc, config: CollabAgentConfig) {
    this.doc = doc;
    this.name = config.agentName;
    this.color = config.agentColor;
    this.generateEdits = config.generateEdits;
  }

  /** Apply a single validated edit operation to the Yjs doc. */
  applyOperation(op: EditOperation): void {
    this.doc.transact(() => {
      switch (op.type) {
        case "insert": {
          const text = this.doc.getText(op.sharedType);
          text.insert(op.index, op.content);
          break;
        }
        case "delete": {
          const text = this.doc.getText(op.sharedType);
          text.delete(op.index, op.length);
          break;
        }
        case "format": {
          const text = this.doc.getText(op.sharedType);
          text.format(op.index, op.length, op.attributes);
          break;
        }
        case "mapSet": {
          const map = this.doc.getMap(op.sharedType);
          map.set(op.key, op.value);
          break;
        }
        case "arrayPush": {
          const arr = this.doc.getArray<string>(op.sharedType);
          arr.push(op.items);
          break;
        }
      }
    }, this.doc.clientID);
  }

  /** Ask the AI model to generate edits, validate, and apply them. */
  async processInstruction(instruction: string): Promise<AgentResponse> {
    const context: AgentContext = {
      documentContent: this.doc.getText("content").toString(),
      sharedTypes: {
        content: this.doc.getText("content").toString(),
      },
      instruction,
    };

    const response = await this.generateEdits(context);
    const validated = AgentResponseSchema.parse(response);

    for (const op of validated.operations) {
      this.applyOperation(op);
    }

    return validated;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function syncDocs(docA: Y.Doc, docB: Y.Doc): void {
  const svA = Y.encodeStateVector(docA);
  const svB = Y.encodeStateVector(docB);
  const diffAtoB = Y.encodeStateAsUpdate(docA, svB);
  const diffBtoA = Y.encodeStateAsUpdate(docB, svA);
  Y.applyUpdate(docB, diffAtoB);
  Y.applyUpdate(docA, diffBtoA);
}

function createMockGenerateEdits(
  response: AgentResponse,
): CollabAgentConfig["generateEdits"] {
  return mock(async (_context: AgentContext) => response);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("CollabAgent - AI participation in CRDT session", () => {
  let humanDoc: Y.Doc;
  let agentDoc: Y.Doc;

  beforeEach(() => {
    humanDoc = new Y.Doc();
    agentDoc = new Y.Doc();
  });

  afterEach(() => {
    humanDoc.destroy();
    agentDoc.destroy();
  });

  test("agent insert operation applies to Yjs document", () => {
    const generateEdits = createMockGenerateEdits({
      reasoning: "Adding greeting text",
      operations: [
        { type: "insert", sharedType: "content", index: 0, content: "Hello from AI" },
      ],
    });

    const agent = new CollabAgent(agentDoc, {
      agentName: "BuilderBot",
      agentColor: "#00ff00",
      generateEdits,
    });

    agent.applyOperation({
      type: "insert",
      sharedType: "content",
      index: 0,
      content: "Hello from AI",
    });

    expect(agentDoc.getText("content").toString()).toBe("Hello from AI");
  });

  test("agent delete operation removes text correctly", () => {
    agentDoc.getText("content").insert(0, "Hello World");

    const agent = new CollabAgent(agentDoc, {
      agentName: "EditorBot",
      agentColor: "#0000ff",
      generateEdits: createMockGenerateEdits({
        reasoning: "Removing extra text",
        operations: [],
      }),
    });

    agent.applyOperation({
      type: "delete",
      sharedType: "content",
      index: 5,
      length: 6,
    });

    expect(agentDoc.getText("content").toString()).toBe("Hello");
  });

  test("agent format operation applies attributes", () => {
    agentDoc.getText("content").insert(0, "Bold text");

    const agent = new CollabAgent(agentDoc, {
      agentName: "FormatterBot",
      agentColor: "#ff00ff",
      generateEdits: createMockGenerateEdits({
        reasoning: "Formatting",
        operations: [],
      }),
    });

    agent.applyOperation({
      type: "format",
      sharedType: "content",
      index: 0,
      length: 4,
      attributes: { bold: true },
    });

    const delta = agentDoc.getText("content").toDelta();
    expect(delta[0]).toEqual({
      insert: "Bold",
      attributes: { bold: true },
    });
  });

  test("agent map set operation updates shared map", () => {
    const agent = new CollabAgent(agentDoc, {
      agentName: "ConfigBot",
      agentColor: "#ffff00",
      generateEdits: createMockGenerateEdits({
        reasoning: "Setting config",
        operations: [],
      }),
    });

    agent.applyOperation({
      type: "mapSet",
      sharedType: "metadata",
      key: "title",
      value: "AI Generated Page",
    });

    expect(agentDoc.getMap("metadata").get("title")).toBe("AI Generated Page");
  });

  test("agent array push operation appends items", () => {
    const agent = new CollabAgent(agentDoc, {
      agentName: "ListBot",
      agentColor: "#00ffff",
      generateEdits: createMockGenerateEdits({
        reasoning: "Adding components",
        operations: [],
      }),
    });

    agent.applyOperation({
      type: "arrayPush",
      sharedType: "components",
      items: ["Header", "Hero", "Footer"],
    });

    expect(agentDoc.getArray("components").toJSON()).toEqual([
      "Header",
      "Hero",
      "Footer",
    ]);
  });

  test("agent edits merge with human edits via CRDT sync", () => {
    // Human writes some content
    humanDoc.getText("content").insert(0, "Human wrote this. ");

    // Agent writes content in its own doc
    const agent = new CollabAgent(agentDoc, {
      agentName: "CoAuthor",
      agentColor: "#00ff00",
      generateEdits: createMockGenerateEdits({
        reasoning: "Adding AI content",
        operations: [],
      }),
    });

    agent.applyOperation({
      type: "insert",
      sharedType: "content",
      index: 0,
      content: "AI added this. ",
    });

    // Sync the docs (simulates WebSocket sync)
    syncDocs(humanDoc, agentDoc);

    const humanText = humanDoc.getText("content").toString();
    const agentText = agentDoc.getText("content").toString();

    // Both docs must converge
    expect(humanText).toBe(agentText);
    expect(humanText).toContain("Human wrote this.");
    expect(humanText).toContain("AI added this.");
  });

  test("concurrent human and agent edits on same text converge", () => {
    // Shared baseline
    humanDoc.getText("content").insert(0, "Base text");
    syncDocs(humanDoc, agentDoc);

    const agent = new CollabAgent(agentDoc, {
      agentName: "Editor",
      agentColor: "#ff0000",
      generateEdits: createMockGenerateEdits({
        reasoning: "Editing",
        operations: [],
      }),
    });

    // Concurrent edits (no sync between)
    humanDoc.getText("content").insert(0, "[Human] ");
    agent.applyOperation({
      type: "insert",
      sharedType: "content",
      index: 9, // after "Base text"
      content: " [Agent]",
    });

    // Sync
    syncDocs(humanDoc, agentDoc);

    expect(humanDoc.getText("content").toString()).toBe(
      agentDoc.getText("content").toString(),
    );
    expect(humanDoc.getText("content").toString()).toContain("[Human]");
    expect(humanDoc.getText("content").toString()).toContain("[Agent]");
  });

  test("processInstruction calls generateEdits and applies operations", async () => {
    const mockResponse: AgentResponse = {
      reasoning: "Creating a hero section with heading and button",
      operations: [
        {
          type: "insert",
          sharedType: "content",
          index: 0,
          content: "Welcome to our site",
        },
        {
          type: "mapSet",
          sharedType: "metadata",
          key: "pageType",
          value: "landing",
        },
        {
          type: "arrayPush",
          sharedType: "components",
          items: ["HeroSection", "CTAButton"],
        },
      ],
    };

    const generateEdits = createMockGenerateEdits(mockResponse);

    const agent = new CollabAgent(agentDoc, {
      agentName: "BuilderBot",
      agentColor: "#00ff00",
      generateEdits,
    });

    const result = await agent.processInstruction(
      "Build a landing page hero section",
    );

    // Verify the mock was called
    expect(generateEdits).toHaveBeenCalledTimes(1);

    // Verify the response
    expect(result.reasoning).toBe(
      "Creating a hero section with heading and button",
    );
    expect(result.operations.length).toBe(3);

    // Verify operations were applied to the doc
    expect(agentDoc.getText("content").toString()).toBe(
      "Welcome to our site",
    );
    expect(agentDoc.getMap("metadata").get("pageType")).toBe("landing");
    expect(agentDoc.getArray("components").toJSON()).toEqual([
      "HeroSection",
      "CTAButton",
    ]);
  });

  test("processInstruction passes document context to generateEdits", async () => {
    // Pre-populate document
    agentDoc.getText("content").insert(0, "Existing content");

    let capturedContext: AgentContext | null = null;
    const generateEdits = mock(
      async (context: AgentContext): Promise<AgentResponse> => {
        capturedContext = context;
        return { reasoning: "No changes needed", operations: [] };
      },
    );

    const agent = new CollabAgent(agentDoc, {
      agentName: "AnalyzerBot",
      agentColor: "#ff00ff",
      generateEdits,
    });

    await agent.processInstruction("Analyze the document");

    expect(capturedContext).not.toBeNull();
    const ctx = capturedContext as unknown as AgentContext;
    expect(ctx.documentContent).toBe("Existing content");
    expect(ctx.instruction).toBe("Analyze the document");
    expect(ctx.sharedTypes.content).toBe("Existing content");
  });

  test("multiple agents can edit the same document", () => {
    const agentADoc = new Y.Doc();
    const agentBDoc = new Y.Doc();

    const agentA = new CollabAgent(agentADoc, {
      agentName: "AgentA",
      agentColor: "#ff0000",
      generateEdits: createMockGenerateEdits({
        reasoning: "",
        operations: [],
      }),
    });

    const agentB = new CollabAgent(agentBDoc, {
      agentName: "AgentB",
      agentColor: "#0000ff",
      generateEdits: createMockGenerateEdits({
        reasoning: "",
        operations: [],
      }),
    });

    agentA.applyOperation({
      type: "insert",
      sharedType: "content",
      index: 0,
      content: "Agent A says hello. ",
    });

    agentB.applyOperation({
      type: "insert",
      sharedType: "content",
      index: 0,
      content: "Agent B says hi. ",
    });

    // Sync all three: human + agentA + agentB
    syncDocs(agentADoc, agentBDoc);
    syncDocs(humanDoc, agentADoc);
    syncDocs(humanDoc, agentBDoc);

    const finalA = agentADoc.getText("content").toString();
    const finalB = agentBDoc.getText("content").toString();
    const finalHuman = humanDoc.getText("content").toString();

    expect(finalA).toBe(finalB);
    expect(finalB).toBe(finalHuman);
    expect(finalA).toContain("Agent A says hello.");
    expect(finalA).toContain("Agent B says hi.");

    agentADoc.destroy();
    agentBDoc.destroy();
  });

  test("agent operations are wrapped in a single transaction", () => {
    let updateCount = 0;
    agentDoc.on("update", () => {
      updateCount++;
    });

    const agent = new CollabAgent(agentDoc, {
      agentName: "BatchBot",
      agentColor: "#00ff00",
      generateEdits: createMockGenerateEdits({
        reasoning: "",
        operations: [],
      }),
    });

    // applyOperation wraps in transact, so each call is one transaction
    agent.applyOperation({
      type: "insert",
      sharedType: "content",
      index: 0,
      content: "Hello",
    });

    expect(updateCount).toBe(1);
  });
});

// ── Schema validation tests ─────────────────────────────────────────

describe("EditOperationSchema validation", () => {
  test("validates insert operation", () => {
    const result = EditOperationSchema.safeParse({
      type: "insert",
      sharedType: "content",
      index: 0,
      content: "Hello",
    });
    expect(result.success).toBe(true);
  });

  test("validates delete operation", () => {
    const result = EditOperationSchema.safeParse({
      type: "delete",
      sharedType: "content",
      index: 5,
      length: 3,
    });
    expect(result.success).toBe(true);
  });

  test("validates format operation", () => {
    const result = EditOperationSchema.safeParse({
      type: "format",
      sharedType: "content",
      index: 0,
      length: 5,
      attributes: { bold: true },
    });
    expect(result.success).toBe(true);
  });

  test("validates mapSet operation", () => {
    const result = EditOperationSchema.safeParse({
      type: "mapSet",
      sharedType: "metadata",
      key: "title",
      value: "Test",
    });
    expect(result.success).toBe(true);
  });

  test("validates arrayPush operation", () => {
    const result = EditOperationSchema.safeParse({
      type: "arrayPush",
      sharedType: "components",
      items: ["Header"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid operation type", () => {
    const result = EditOperationSchema.safeParse({
      type: "invalid",
      sharedType: "content",
    });
    expect(result.success).toBe(false);
  });

  test("rejects insert without content", () => {
    const result = EditOperationSchema.safeParse({
      type: "insert",
      sharedType: "content",
      index: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("AgentResponseSchema validation", () => {
  test("validates complete agent response", () => {
    const result = AgentResponseSchema.safeParse({
      reasoning: "Adding a header",
      operations: [
        { type: "insert", sharedType: "content", index: 0, content: "Header" },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("validates response with empty operations", () => {
    const result = AgentResponseSchema.safeParse({
      reasoning: "No changes needed",
      operations: [],
    });
    expect(result.success).toBe(true);
  });

  test("rejects response without reasoning", () => {
    const result = AgentResponseSchema.safeParse({
      operations: [],
    });
    expect(result.success).toBe(false);
  });
});
