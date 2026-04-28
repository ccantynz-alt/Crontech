// ── Constraint Solver: AI Layout Generator ────────────────────────────
// Generates UI layouts by feeding the full typed component catalog to
// the AI as constraints. Unlike raw HTML generation, the AI can ONLY
// emit components that exist in the catalog — the Zod schema enforced
// via `generateObject` makes it physically impossible to hallucinate a
// prop that does not exist or a component that is not registered.
//
// This is the architectural moat: Lovable generates raw HTML and hopes
// it compiles. Crontech generates from a typed catalog and guarantees
// validity by construction.

import {
  type PageLayout,
  PageLayoutSchema,
  describeComponentCatalog,
  getModelForTier,
  readProviderEnv,
} from "@back-to-the-future/ai-core";
import { ComponentCatalog, type ComponentName } from "@back-to-the-future/schemas";
import { TRPCError } from "@trpc/server";
import { generateObject, streamObject } from "ai";

// ── Catalog Description ───────────────────────────────────────────────
// Generates a rich, prop-aware description of every component in the
// catalog. The AI is told exactly what components exist, what props
// each accepts, and which props are required vs optional. This is the
// "constraint" in constraint solver — the prompt IS the type system.

function buildCatalogConstraintBlock(): string {
  const names = Object.keys(ComponentCatalog) as ComponentName[];

  // Use the existing describeComponentCatalog utility from ai-core for
  // the base description, then augment it with per-component details.
  const baseDescription = describeComponentCatalog(names);

  const componentDetails = names
    .map((name) => {
      switch (name) {
        case "Button":
          return `  - Button: { component: "Button", props: { variant: "default"|"primary"|"secondary"|"destructive"|"outline"|"ghost"|"link", size: "sm"|"md"|"lg"|"icon", disabled: boolean, loading: boolean, label: string, onClick?: string } }`;
        case "Input":
          return `  - Input: { component: "Input", props: { type: "text"|"email"|"password"|"number"|"search"|"tel"|"url", placeholder?: string, label?: string, required: boolean, disabled: boolean, error?: string, name: string } }`;
        case "Card":
          return `  - Card: { component: "Card", props: { title?: string, description?: string, padding: "none"|"sm"|"md"|"lg" }, children?: Component[] }`;
        case "Stack":
          return `  - Stack: { component: "Stack", props: { direction: "horizontal"|"vertical", gap: "none"|"xs"|"sm"|"md"|"lg"|"xl", align: "start"|"center"|"end"|"stretch", justify: "start"|"center"|"end"|"between"|"around" }, children?: Component[] }`;
        case "Text":
          return `  - Text: { component: "Text", props: { content: string, variant: "h1"|"h2"|"h3"|"h4"|"body"|"caption"|"code", weight: "normal"|"medium"|"semibold"|"bold", align: "left"|"center"|"right" } }`;
        case "Modal":
          return `  - Modal: { component: "Modal", props: { title: string, description?: string, open: boolean, size: "sm"|"md"|"lg"|"xl" }, children?: Component[] }`;
        case "Badge":
          return `  - Badge: { component: "Badge", props: { variant: "default"|"success"|"warning"|"error"|"info", size: "sm"|"md", label: string } }`;
        case "Alert":
          return `  - Alert: { component: "Alert", props: { variant: "info"|"success"|"warning"|"error", title?: string, description?: string, dismissible: boolean }, children?: Component[] }`;
        case "Avatar":
          return `  - Avatar: { component: "Avatar", props: { src?: string, alt?: string, initials?: string, size: "sm"|"md"|"lg" } }`;
        case "Tabs":
          return `  - Tabs: { component: "Tabs", props: { items: Array<{ id: string, label: string, disabled?: boolean }>, defaultTab?: string } }`;
        case "Select":
          return `  - Select: { component: "Select", props: { options: Array<{ value: string, label: string, disabled?: boolean }>, value?: string, placeholder?: string, label?: string, error?: string, disabled: boolean, name?: string } }`;
        case "Textarea":
          return `  - Textarea: { component: "Textarea", props: { label?: string, error?: string, placeholder?: string, rows: number, resize: "none"|"vertical"|"horizontal"|"both", required: boolean, disabled: boolean, name?: string } }`;
        case "Spinner":
          return `  - Spinner: { component: "Spinner", props: { size: "sm"|"md"|"lg" } }`;
        case "Tooltip":
          return `  - Tooltip: { component: "Tooltip", props: { content: string, position: "top"|"bottom"|"left"|"right" }, children?: Component[] }`;
        case "Separator":
          return `  - Separator: { component: "Separator", props: { orientation: "horizontal"|"vertical" } }`;
        default:
          return `  - ${name}: See catalog.`;
      }
    })
    .join("\n");

  return `${baseDescription}\n\nExact component shapes (TypeScript notation):\n${componentDetails}`;
}

// ── System Prompt Builder ─────────────────────────────────────────────

function buildSystemPrompt(
  mode: "create" | "mutate",
  existingLayout: PageLayout | undefined,
): string {
  const catalogBlock = buildCatalogConstraintBlock();

  const mutateContext =
    mode === "mutate" && existingLayout !== undefined
      ? `\n\n## Existing Layout to Modify\nPreserve as much structure as possible. Only change what the intent requires.\n\nCurrent layout:\n${JSON.stringify(existingLayout, null, 2)}`
      : "";

  return `You are the Crontech Constraint Solver — a UI layout generator that produces validated component trees.

## Your Only Job
Generate a PageLayout JSON object that satisfies the user's intent using ONLY components from the catalog below.

## The Constraint Catalog
You MUST only use components from this catalog. Do not invent props that aren't in the schema. Do not use HTML. Do not use components that aren't listed here.

${catalogBlock}

## Output Rules
1. Output a PageLayout with: title (string), description (string), components (array of catalog components).
2. Every component MUST have a "component" field matching a catalog name exactly.
3. Every prop MUST match the catalog schema — correct types, correct enum values.
4. Stack and Card support children — use them to compose layouts.
5. Text with variant "h1" for page titles, "h2"/"h3" for sections, "body" for paragraphs.
6. Prefer Stack(vertical) as the root container, Stack(horizontal) for side-by-side elements.
7. Keep layouts practical and purposeful — every component must serve the intent.${mutateContext}`;
}

// ── Context Types ─────────────────────────────────────────────────────

export interface SolveLayoutContext {
  existingLayout?: PageLayout | undefined;
  mode?: "create" | "mutate" | undefined;
}

// ── hasProvider guard ─────────────────────────────────────────────────
// Throws PRECONDITION_FAILED instead of silently using a stub so the
// caller can decide how to handle the missing key. The guard is
// intentionally broad: both Anthropic and OpenAI keys satisfy it.

function assertProviderConfigured(): void {
  const env = readProviderEnv();
  const hasAnthropic = env.anthropic !== undefined && env.anthropic.apiKey.length > 5;
  const hasOpenAI = env.cloud.apiKey.length > 5;

  if (!hasAnthropic && !hasOpenAI) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use the constraint solver.",
    });
  }
}

// ── solveLayout ───────────────────────────────────────────────────────
// Primary non-streaming entry point. Uses generateObject with the full
// PageLayoutSchema as the output schema — the AI cannot return a layout
// that fails Zod validation because the SDK enforces it at call time.

export async function solveLayout(
  intent: string,
  context?: SolveLayoutContext,
): Promise<PageLayout> {
  assertProviderConfigured();

  const mode = context?.mode ?? "create";
  const existingLayout = context?.existingLayout;

  const model = getModelForTier("cloud");

  const systemPrompt = buildSystemPrompt(mode, existingLayout);

  const userPrompt =
    mode === "mutate" && existingLayout !== undefined
      ? `Modify the existing layout to match this intent while preserving structure where possible:\n\n${intent}`
      : `Generate a page layout for this intent:\n\n${intent}`;

  const { object } = await generateObject({
    model,
    schema: PageLayoutSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,
  });

  return object;
}

// ── streamLayout ──────────────────────────────────────────────────────
// Streaming variant for the voice-morph use case. Called ~every 400ms
// with partial transcripts. Returns an AsyncIterable of partial
// PageLayout objects as they stream from the model. Each yielded value
// is a partial object — consumers should treat undefined fields as
// "not yet generated."

export type PartialPageLayout = {
  title?: string | undefined;
  description?: string | undefined;
  components?: PageLayout["components"] | undefined;
};

export async function* streamLayout(intent: string): AsyncIterable<PartialPageLayout> {
  assertProviderConfigured();

  const model = getModelForTier("cloud");
  const systemPrompt = buildSystemPrompt("create", undefined);

  // streamObject is synchronous — destructure partialObjectStream
  // immediately and iterate over it as an async iterable. Each chunk
  // is a partial PageLayout where unresolved fields are undefined.
  const { partialObjectStream } = streamObject({
    model,
    schema: PageLayoutSchema,
    system: systemPrompt,
    prompt: `Generate a page layout for this intent:\n\n${intent}`,
    temperature: 0.3,
  });

  for await (const partial of partialObjectStream) {
    yield partial as PartialPageLayout;
  }
}

// ── Re-export types that callers need ─────────────────────────────────
export type { PageLayout };
