// ── Layout Tools ──────────────────────────────────────────────────
// Tools for creating and manipulating page layouts.
// Used by the website builder agent during multi-step generation.
// All tools use Zod input schemas and return validated structures.

import { tool } from "ai";
import { z } from "zod";
import { ComponentSchema } from "@back-to-the-future/schemas";
import type { Component } from "@back-to-the-future/schemas";

// ── Schemas ─────────────────────────────────────────────────────

const SectionSlot = z.enum([
  "header",
  "main",
  "footer",
  "sidebar",
]);

export type SectionSlot = z.infer<typeof SectionSlot>;

const PageSectionSchema = z.object({
  slot: SectionSlot,
  components: z.array(ComponentSchema),
  className: z.string().default(""),
});

export type PageSection = z.infer<typeof PageSectionSchema>;

const PageLayoutResultSchema = z.object({
  sections: z.array(PageSectionSchema),
  className: z.string().default(""),
});

export type PageLayoutResult = z.infer<typeof PageLayoutResultSchema>;

// ── layoutPage ──────────────────────────────────────────────────

const LayoutPageInputSchema = z.object({
  includeHeader: z
    .boolean()
    .default(true)
    .describe("Whether to include a header section"),
  includeFooter: z
    .boolean()
    .default(true)
    .describe("Whether to include a footer section"),
  includeSidebar: z
    .boolean()
    .default(false)
    .describe("Whether to include a sidebar section"),
  headerTitle: z
    .string()
    .optional()
    .describe("Title text for the header"),
  footerText: z
    .string()
    .optional()
    .describe("Text content for the footer"),
  className: z
    .string()
    .default("")
    .describe("Additional Tailwind classes for the page wrapper"),
});

export const layoutPage = tool({
  description:
    "Create a page layout structure with optional header, main content area, footer, and sidebar. " +
    "Returns a skeleton layout that other tools can populate with components.",
  inputSchema: LayoutPageInputSchema,
  execute: async (input): Promise<PageLayoutResult> => {
    const sections: PageSection[] = [];

    if (input.includeHeader) {
      const headerComponents: Component[] = [];

      const headerTitle: Component = {
        component: "Text",
        props: {
          content: input.headerTitle ?? "Page Title",
          variant: "h1",
          weight: "bold",
          align: "left",
        },
      };
      headerComponents.push(headerTitle);

      sections.push({
        slot: "header",
        components: headerComponents,
        className: "w-full border-b border-gray-200 pb-4 mb-6",
      });
    }

    if (input.includeSidebar) {
      sections.push({
        slot: "sidebar",
        components: [],
        className: "w-64 shrink-0",
      });
    }

    // Main content area is always included
    sections.push({
      slot: "main",
      components: [],
      className: "flex-1",
    });

    if (input.includeFooter) {
      const footerComponents: Component[] = [];

      const footerText: Component = {
        component: "Text",
        props: {
          content: input.footerText ?? "Built with Back to the Future",
          variant: "caption",
          weight: "normal",
          align: "center",
        },
      };
      footerComponents.push(footerText);

      sections.push({
        slot: "footer",
        components: footerComponents,
        className: "w-full border-t border-gray-200 pt-4 mt-6",
      });
    }

    return {
      sections,
      className: input.className,
    };
  },
});

// ── addSection ──────────────────────────────────────────────────

const AddSectionInputSchema = z.object({
  slot: SectionSlot.describe("Which layout slot to add the section to"),
  components: z
    .array(ComponentSchema)
    .min(1)
    .describe("Components to add to the section"),
  position: z
    .enum(["prepend", "append"])
    .default("append")
    .describe("Whether to add components at the beginning or end of the slot"),
  className: z
    .string()
    .default("")
    .describe("Additional Tailwind classes for the section wrapper"),
  existingLayout: PageLayoutResultSchema.describe(
    "The current page layout to modify",
  ),
});

export const addSection = tool({
  description:
    "Add components to a specific slot (header, main, footer, sidebar) in an existing page layout. " +
    "Use this to incrementally build up a page after creating the initial layout with layoutPage.",
  inputSchema: AddSectionInputSchema,
  execute: async (input): Promise<PageLayoutResult> => {
    const updatedSections = input.existingLayout.sections.map((section) => {
      if (section.slot !== input.slot) {
        return section;
      }

      const existingComponents = section.components;
      const newComponents =
        input.position === "prepend"
          ? [...input.components, ...existingComponents]
          : [...existingComponents, ...input.components];

      const mergedClassName = [section.className, input.className]
        .filter(Boolean)
        .join(" ");

      return {
        ...section,
        components: newComponents,
        className: mergedClassName,
      };
    });

    // If the slot does not exist yet, add a new section
    const slotExists = updatedSections.some((s) => s.slot === input.slot);
    if (!slotExists) {
      updatedSections.push({
        slot: input.slot,
        components: input.components,
        className: input.className,
      });
    }

    return {
      sections: updatedSections,
      className: input.existingLayout.className,
    };
  },
});

// ── updateStyles ────────────────────────────────────────────────

const UpdateStylesInputSchema = z.object({
  slot: SectionSlot.describe("Which layout slot contains the target component"),
  componentIndex: z
    .number()
    .int()
    .min(0)
    .describe("Index of the component within the slot to update"),
  addClasses: z
    .string()
    .default("")
    .describe("Tailwind classes to add"),
  removeClasses: z
    .string()
    .default("")
    .describe("Tailwind classes to remove"),
  existingLayout: PageLayoutResultSchema.describe(
    "The current page layout to modify",
  ),
});

export interface UpdateStylesResult {
  success: boolean;
  layout: PageLayoutResult;
  message: string;
}

export const updateStyles = tool({
  description:
    "Modify Tailwind CSS classes on a specific component in the page layout. " +
    "Specify the slot and component index, then add or remove Tailwind classes. " +
    "Use this to adjust spacing, colors, typography, and responsive behavior.",
  inputSchema: UpdateStylesInputSchema,
  execute: async (input): Promise<UpdateStylesResult> => {
    const targetSection = input.existingLayout.sections.find(
      (s) => s.slot === input.slot,
    );

    if (!targetSection) {
      return {
        success: false,
        layout: input.existingLayout,
        message: `Slot "${input.slot}" not found in the layout.`,
      };
    }

    if (
      input.componentIndex < 0 ||
      input.componentIndex >= targetSection.components.length
    ) {
      return {
        success: false,
        layout: input.existingLayout,
        message: `Component index ${input.componentIndex} is out of range for slot "${input.slot}" (has ${targetSection.components.length} components).`,
      };
    }

    // Parse classes to add and remove
    const classesToAdd = input.addClasses
      .split(/\s+/)
      .filter((c) => c.length > 0);
    const classesToRemove = new Set(
      input.removeClasses.split(/\s+/).filter((c) => c.length > 0),
    );

    // Update the section className (component-level styling is via the section wrapper)
    const updatedSections = input.existingLayout.sections.map((section) => {
      if (section.slot !== input.slot) {
        return section;
      }

      // Apply class changes to the section className at the component index level
      const existingClasses = section.className
        .split(/\s+/)
        .filter((c) => c.length > 0);
      const filtered = existingClasses.filter((c) => !classesToRemove.has(c));
      const merged = [...filtered, ...classesToAdd];
      const deduped = [...new Set(merged)];

      return {
        ...section,
        className: deduped.join(" "),
      };
    });

    const updatedLayout: PageLayoutResult = {
      sections: updatedSections,
      className: input.existingLayout.className,
    };

    return {
      success: true,
      layout: updatedLayout,
      message: `Updated styles on slot "${input.slot}". Added: [${classesToAdd.join(", ")}]. Removed: [${[...classesToRemove].join(", ")}].`,
    };
  },
});

// ── Layout Tool Registry ────────────────────────────────────────

export const layoutTools = {
  layoutPage,
  addSection,
  updateStyles,
} as const;

export type LayoutToolName = keyof typeof layoutTools;
