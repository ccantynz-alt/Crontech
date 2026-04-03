// ── Site Architect Specialist Agent ──────────────────────────────
// Designs website structure from user descriptions.
// Produces: page tree, component selections from the catalog,
// layout decisions, and navigation structure.
// Uses the component Zod schemas from @cronix/schemas.

import { generateObject, streamText } from "ai";
import { z } from "zod";
import { ComponentCatalog, type ComponentName } from "@cronix/schemas";
import { getModelForTier, getDefaultModel } from "../../providers";
import {
  SiteArchitectureSchema,
  type AgentConfig,
} from "../types";

// ── Input Schema ────────────────────────────────────────────────

export const SiteArchitectInputSchema = z.object({
  description: z
    .string()
    .describe("Natural language description of the desired website"),
  purpose: z
    .enum(["landing", "saas", "blog", "portfolio", "ecommerce", "documentation", "dashboard", "other"])
    .default("other")
    .describe("Primary purpose of the website"),
  pageCount: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .describe("Approximate number of pages"),
  features: z
    .array(z.string())
    .optional()
    .describe("Specific features requested (e.g., 'contact form', 'blog', 'pricing table')"),
  style: z
    .object({
      tone: z.enum(["professional", "playful", "minimal", "bold", "elegant"]).optional(),
      colorScheme: z.string().optional(),
      inspiration: z.array(z.string()).optional(),
    })
    .optional()
    .describe("Design style preferences"),
});

export type SiteArchitectInput = z.infer<typeof SiteArchitectInputSchema>;

// ── Extended Output Schema ──────────────────────────────────────
// Adds implementation details to the base SiteArchitecture

export const SiteArchitectOutputSchema = z.object({
  architecture: SiteArchitectureSchema,
  componentUsage: z.array(
    z.object({
      component: z.string().describe("Component name from catalog"),
      count: z.number().int().describe("How many times used across all pages"),
      pages: z.array(z.string()).describe("Which pages use this component"),
    }),
  ),
  estimatedComplexity: z.enum(["simple", "moderate", "complex"]),
  implementationNotes: z.array(z.string()),
});

export type SiteArchitectOutput = z.infer<typeof SiteArchitectOutputSchema>;

// ── System Prompt ───────────────────────────────────────────────

function buildArchitectPrompt(): string {
  const componentList = (Object.keys(ComponentCatalog) as ComponentName[])
    .map((name) => `- **${name}**`)
    .join("\n");

  return `You are the Site Architect agent for the Cronix platform.
Your job is to design website structures from user descriptions, using ONLY components from the Cronix catalog.

## Available Components
${componentList}

## Architecture Rules
1. ZERO HTML. Every visual element must map to a catalog component.
2. Use Stack for layouts (horizontal/vertical arrangement).
3. Use Card for content grouping and visual separation.
4. Use Text with appropriate variants (h1 for page titles, h2 for sections, body for paragraphs).
5. Use Button for all interactive elements.
6. Use Input/Textarea/Select for form fields.
7. Use Modal for overlays and confirmations.
8. Use Alert for notifications and banners.
9. Use Tabs for content organization within pages.
10. Use Badge for status indicators and labels.
11. Use Separator for visual breaks.

## Design Principles
- Mobile-first responsive design
- Clear visual hierarchy (h1 > h2 > h3 > body)
- Consistent spacing via Stack gap props
- Accessible by default (every input has a label, every button has a label)
- Performance-first: minimize component depth

## Navigation Patterns
- Top-level pages in main navigation
- Nested pages as dropdown children
- Every page reachable within 2 clicks
- Include breadcrumbs for deep pages

## Layout Types
- "default": Standard layout with header, content, footer
- "full-width": Edge-to-edge content (landing pages, hero sections)
- "sidebar": Content + sidebar navigation (dashboards, docs)
- "centered": Narrow centered content (auth pages, forms)
`;
}

// ── Site Architect Agent Function ────────────────────────────────

/**
 * Run the Site Architect agent to design a website structure.
 * Returns a complete site architecture with component selections.
 */
export async function runSiteArchitect(
  input: SiteArchitectInput,
  config: AgentConfig,
): Promise<SiteArchitectOutput> {
  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  const featuresStr = input.features?.length
    ? `\nRequested features: ${input.features.join(", ")}`
    : "";

  const styleStr = input.style
    ? `\nStyle preferences: ${JSON.stringify(input.style)}`
    : "";

  const { object } = await generateObject({
    model,
    schema: SiteArchitectOutputSchema,
    system: buildArchitectPrompt(),
    prompt: `Design a website architecture for the following:

Description: ${input.description}
Purpose: ${input.purpose}
Target page count: ${input.pageCount}${featuresStr}${styleStr}

Create a complete site architecture with:
1. Page tree with paths, titles, layouts, and component lists
2. Navigation structure
3. Component usage summary
4. Design decisions and rationale
5. Implementation notes`,
    temperature: config.temperature ?? 0.5,
  });

  config.onEvent?.({
    type: "complete",
    finalOutput: JSON.stringify(object),
    timestamp: Date.now(),
  });

  return object;
}

/**
 * Stream the Site Architect analysis as text.
 */
export function streamSiteArchitect(
  input: SiteArchitectInput,
  config: AgentConfig,
): ReturnType<typeof streamText> {
  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  const featuresStr = input.features?.length
    ? `\nRequested features: ${input.features.join(", ")}`
    : "";

  const styleStr = input.style
    ? `\nStyle preferences: ${JSON.stringify(input.style)}`
    : "";

  return streamText({
    model,
    system: buildArchitectPrompt(),
    prompt: `Design a website architecture for the following:

Description: ${input.description}
Purpose: ${input.purpose}
Target page count: ${input.pageCount}${featuresStr}${styleStr}

Provide a detailed architecture including page tree, navigation, component selections, and design rationale.`,
    maxOutputTokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.5,
  });
}
