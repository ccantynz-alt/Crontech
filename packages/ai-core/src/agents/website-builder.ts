// ── Website Builder Agent ──────────────────────────────────────────
// Multi-step AI agent that builds websites through tool calling.
// Flow: analyze user intent -> plan page layout -> generate components -> assemble page
// Returns validated component trees (ComponentSchema[]) via streaming.

import {
  streamText,
  generateObject,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import {
  ComponentSchema,
  ComponentCatalog,
  type Component,
} from "@back-to-the-future/schemas";
import {
  getModelForTier,
  getDefaultModel,
  type AIProviderEnv,
} from "../providers";
import type { ComputeTier } from "../compute-tier";
import { searchContent, generateComponent } from "../tools";
import { layoutPage, addSection, updateStyles } from "./tools/layout";
import type { ApprovalGate } from "../approval";

// ── Types ───────────────────────────────────────────────────────

export interface WebsiteBuilderConfig {
  computeTier?: ComputeTier;
  providerEnv?: AIProviderEnv;
  maxTokens?: number;
  temperature?: number;
  maxSteps?: number;
  approvalGate?: ApprovalGate;
}

/** A streaming event emitted by the builder during generation. */
export type BuilderEvent =
  | { type: "status"; phase: BuildPhase; message: string }
  | { type: "component"; component: Component }
  | { type: "layout"; sections: LayoutSection[] }
  | { type: "text"; content: string }
  | { type: "error"; message: string }
  | { type: "complete"; components: Component[] };

export type BuildPhase =
  | "analyzing"
  | "planning"
  | "generating"
  | "assembling"
  | "refining"
  | "complete";

export interface LayoutSection {
  slot: string;
  components: Component[];
  className: string;
}

export interface BuildResult {
  components: Component[];
  title: string;
  description: string;
}

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<
  Pick<WebsiteBuilderConfig, "computeTier" | "maxTokens" | "temperature" | "maxSteps">
> = {
  computeTier: "cloud",
  maxTokens: 8192,
  temperature: 0.6,
  maxSteps: 10,
};

const AVAILABLE_COMPONENTS = Object.keys(ComponentCatalog).join(", ");

// ── System Prompt ───────────────────────────────────────────────

const WEBSITE_BUILDER_SYSTEM_PROMPT = `You are the Back to the Future Website Builder Agent -- an expert AI that builds complete websites through multi-step tool calling.

## Your Process
1. ANALYZE the user's request to understand intent, audience, and requirements.
2. PLAN the page layout using the layoutPage tool (header, main, footer, sidebar).
3. GENERATE individual components using generateComponent for each section.
4. ASSEMBLE the complete page by adding sections with the addSection tool.
5. REFINE styling using updateStyles if the user requests visual changes.

## Available Components
${AVAILABLE_COMPONENTS}

## Available Tools
- **layoutPage**: Create a page skeleton with header, main, footer, sidebar slots.
- **addSection**: Add components to a specific slot in the layout.
- **updateStyles**: Modify Tailwind classes on layout sections.
- **generateComponent**: Generate a single validated component from the catalog.
- **searchContent**: Search existing content for reuse in the page.

## Rules
1. ALWAYS use tools to build the page. Never describe components in plain text -- generate them.
2. Start every build with layoutPage to establish structure.
3. Use Stack components to group related elements.
4. Use Card components as content containers.
5. Use Text components with proper semantic variants (h1 for page titles, h2 for section titles, body for content).
6. Every page must have at least a header with a title and a main content area.
7. Nest components properly: Stack and Card support children. Button, Input, Text do not.
8. For forms: combine Input, Select, Textarea inside a Stack with a submit Button.
9. Keep layouts clean and structured. Prefer vertical stacks for page sections, horizontal for navbars and toolbars.
10. After generating all sections, summarize what was built.
`;

// ── Combined Tool Set ───────────────────────────────────────────

const websiteBuilderTools = {
  layoutPage,
  addSection,
  updateStyles,
  generateComponent,
  searchContent,
} as const;

// ── Intent Analysis ─────────────────────────────────────────────

const IntentSchema = z.object({
  pageType: z
    .enum([
      "landing",
      "dashboard",
      "form",
      "blog",
      "portfolio",
      "ecommerce",
      "documentation",
      "custom",
    ])
    .describe("The type of page the user wants"),
  title: z.string().describe("A concise title for the page"),
  description: z.string().describe("What the page should contain and do"),
  sections: z
    .array(
      z.object({
        name: z.string().describe("Section name"),
        purpose: z.string().describe("What this section should contain"),
        suggestedComponents: z
          .array(z.string())
          .describe("Component types to use"),
      }),
    )
    .describe("Planned sections for the page"),
  includeHeader: z.boolean().describe("Whether the page needs a header"),
  includeFooter: z.boolean().describe("Whether the page needs a footer"),
  includeSidebar: z.boolean().describe("Whether the page needs a sidebar"),
});

export type Intent = z.infer<typeof IntentSchema>;

/**
 * Analyze user input to determine what kind of page to build.
 * Returns a structured intent object that guides the generation process.
 */
export async function analyzeIntent(
  userMessage: string,
  config?: WebsiteBuilderConfig,
): Promise<Intent> {
  const model = config?.providerEnv
    ? getModelForTier(config.computeTier ?? DEFAULT_CONFIG.computeTier, config.providerEnv)
    : getDefaultModel();

  const { object } = await generateObject({
    model,
    schema: IntentSchema,
    system:
      "You analyze user requests for website building and produce structured intents. " +
      "Determine the page type, required sections, and which components to use. " +
      `Available components: ${AVAILABLE_COMPONENTS}.`,
    prompt: userMessage,
    temperature: 0.4,
  });

  return object;
}

// ── Component Assembly ──────────────────────────────────────────

const PageComponentsSchema = z.object({
  title: z.string().describe("The page title"),
  description: z.string().describe("Brief description of what was built"),
  components: z
    .array(ComponentSchema)
    .describe("The complete list of components that make up the page"),
});

export type PageComponents = z.infer<typeof PageComponentsSchema>;

/**
 * Generate a complete page as a validated component array using structured output.
 * Used as a fallback or for non-streaming generation.
 */
export async function generatePage(
  userMessage: string,
  config?: WebsiteBuilderConfig,
): Promise<BuildResult> {
  const model = config?.providerEnv
    ? getModelForTier(config.computeTier ?? DEFAULT_CONFIG.computeTier, config.providerEnv)
    : getDefaultModel();

  const { object } = await generateObject({
    model,
    schema: PageComponentsSchema,
    system: WEBSITE_BUILDER_SYSTEM_PROMPT,
    prompt: `Build a complete page for the following request. Return a structured component tree.

User request: ${userMessage}`,
    temperature: config?.temperature ?? DEFAULT_CONFIG.temperature,
  });

  return {
    components: object.components,
    title: object.title,
    description: object.description,
  };
}

// ── Streaming Builder (Multi-Step Tool Calling) ──────────────────

/**
 * Run the website builder agent with streaming text and multi-step tool calling.
 * The agent calls tools (layoutPage, addSection, generateComponent, etc.) in sequence,
 * building up the page incrementally.
 *
 * Returns the streamText result which supports `.toTextStreamResponse()` for SSE
 * and `.textStream` for async iteration.
 */
export function streamWebsiteBuilder(
  messages: ModelMessage[],
  config?: WebsiteBuilderConfig,
): ReturnType<typeof streamText<typeof websiteBuilderTools>> {
  const computeTier = config?.computeTier ?? DEFAULT_CONFIG.computeTier;
  const maxOutputTokens = config?.maxTokens ?? DEFAULT_CONFIG.maxTokens;
  const temperature = config?.temperature ?? DEFAULT_CONFIG.temperature;
  const maxSteps = config?.maxSteps ?? DEFAULT_CONFIG.maxSteps;

  const model = config?.providerEnv
    ? getModelForTier(computeTier, config.providerEnv)
    : getDefaultModel();

  return streamText({
    model,
    system: WEBSITE_BUILDER_SYSTEM_PROMPT,
    messages,
    tools: websiteBuilderTools,
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens,
    temperature,
  });
}

// ── Async Generator (Event Stream) ──────────────────────────────

/**
 * Run the website builder as an async generator that yields BuilderEvents.
 * This provides fine-grained control over the build process for UIs that
 * want to display progress, preview components as they are generated,
 * and show the final assembled page.
 *
 * Usage:
 * ```ts
 * for await (const event of buildWebsite("Build a landing page", config)) {
 *   switch (event.type) {
 *     case "status": // Update progress indicator
 *     case "component": // Add to preview
 *     case "layout": // Show layout skeleton
 *     case "text": // Show agent commentary
 *     case "complete": // Final assembled page
 *     case "error": // Handle error
 *   }
 * }
 * ```
 */
export async function* buildWebsite(
  userMessage: string,
  config?: WebsiteBuilderConfig,
): AsyncGenerator<BuilderEvent> {
  const resolvedConfig: Required<
    Pick<WebsiteBuilderConfig, "computeTier" | "maxTokens" | "temperature" | "maxSteps">
  > & Pick<WebsiteBuilderConfig, "providerEnv" | "approvalGate"> = {
    computeTier: config?.computeTier ?? DEFAULT_CONFIG.computeTier,
    maxTokens: config?.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    temperature: config?.temperature ?? DEFAULT_CONFIG.temperature,
    maxSteps: config?.maxSteps ?? DEFAULT_CONFIG.maxSteps,
    ...(config?.providerEnv !== undefined ? { providerEnv: config.providerEnv } : {}),
    ...(config?.approvalGate !== undefined ? { approvalGate: config.approvalGate } : {}),
  };

  // Phase 1: Analyze intent
  yield { type: "status", phase: "analyzing", message: "Analyzing your request..." };

  let intent: Intent;
  try {
    intent = await analyzeIntent(userMessage, resolvedConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze intent";
    yield { type: "error", message };
    return;
  }

  yield {
    type: "status",
    phase: "planning",
    message: `Planning a ${intent.pageType} page: "${intent.title}"`,
  };

  // Phase 1.5: Request human approval if an approval gate is configured
  if (resolvedConfig.approvalGate) {
    yield {
      type: "status",
      phase: "planning",
      message: "Awaiting human approval...",
    };

    const decision = await resolvedConfig.approvalGate.requestApproval(
      "generate_website",
      "generatePage",
      {
        pageType: intent.pageType,
        title: intent.title,
        sectionCount: intent.sections.length,
      },
      `Generate a ${intent.pageType} page: "${intent.title}" with ${intent.sections.length} section(s)`,
    );

    if (!decision.approved) {
      yield {
        type: "error",
        message: `Build rejected by ${decision.approvedBy}: ${decision.reason ?? "No reason provided"}`,
      };
      return;
    }
  }

  // Phase 2: Generate page via structured output (complete component tree)
  yield { type: "status", phase: "generating", message: "Generating components..." };

  let buildResult: BuildResult;
  try {
    buildResult = await generatePage(userMessage, resolvedConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate page";
    yield { type: "error", message };
    return;
  }

  // Yield each component as it is "discovered"
  for (const component of buildResult.components) {
    yield { type: "component", component };
  }

  // Phase 3: Assemble
  yield {
    type: "status",
    phase: "assembling",
    message: `Assembled ${buildResult.components.length} components`,
  };

  // Phase 4: Complete
  yield {
    type: "status",
    phase: "complete",
    message: buildResult.description,
  };

  yield {
    type: "complete",
    components: buildResult.components,
  };
}

// ── Refinement ──────────────────────────────────────────────────

/**
 * Refine an existing page based on user feedback.
 * Takes the current component tree and a refinement instruction,
 * then returns an updated component tree.
 */
export async function refineWebsite(
  currentComponents: Component[],
  refinementMessage: string,
  config?: WebsiteBuilderConfig,
): Promise<BuildResult> {
  const model = config?.providerEnv
    ? getModelForTier(config.computeTier ?? DEFAULT_CONFIG.computeTier, config.providerEnv)
    : getDefaultModel();

  const currentTree = JSON.stringify(currentComponents, null, 2);

  const { object } = await generateObject({
    model,
    schema: PageComponentsSchema,
    system: WEBSITE_BUILDER_SYSTEM_PROMPT,
    prompt: `The user has an existing page and wants to refine it.

Current component tree:
${currentTree}

User's refinement request: ${refinementMessage}

Return the COMPLETE updated component tree with the requested changes applied. Preserve components that should not change.`,
    temperature: config?.temperature ?? DEFAULT_CONFIG.temperature,
  });

  return {
    components: object.components,
    title: object.title,
    description: object.description,
  };
}

// ── Exports ─────────────────────────────────────────────────────

export { WEBSITE_BUILDER_SYSTEM_PROMPT, websiteBuilderTools, PageComponentsSchema };
