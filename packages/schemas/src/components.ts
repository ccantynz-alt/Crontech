import { z } from "zod";

// ── Core UI Component Schemas (AI-Composable) ──────────────────────
// Every component in the system is defined by a Zod schema.
// AI agents use these schemas to discover, validate, and compose UI.

export const ButtonVariant = z.enum([
  "default",
  "primary",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
]);

export const ButtonSize = z.enum(["sm", "md", "lg", "icon"]);

export const ButtonSchema = z.object({
  component: z.literal("Button"),
  props: z.object({
    variant: ButtonVariant.default("default"),
    size: ButtonSize.default("md"),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
    label: z.string(),
    onClick: z.string().optional(),
  }),
});

export const InputType = z.enum([
  "text",
  "email",
  "password",
  "number",
  "search",
  "tel",
  "url",
]);

export const InputSchema = z.object({
  component: z.literal("Input"),
  props: z.object({
    type: InputType.default("text"),
    placeholder: z.string().optional(),
    label: z.string().optional(),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    error: z.string().optional(),
    name: z.string(),
  }),
});

export const CardSchema = z.object({
  component: z.literal("Card"),
  props: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    padding: z.enum(["none", "sm", "md", "lg"]).default("md"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const StackDirection = z.enum(["horizontal", "vertical"]);

export const StackSchema = z.object({
  component: z.literal("Stack"),
  props: z.object({
    direction: StackDirection.default("vertical"),
    gap: z.enum(["none", "xs", "sm", "md", "lg", "xl"]).default("md"),
    align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    justify: z
      .enum(["start", "center", "end", "between", "around"])
      .default("start"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

export const TextSchema = z.object({
  component: z.literal("Text"),
  props: z.object({
    content: z.string(),
    variant: z
      .enum(["h1", "h2", "h3", "h4", "body", "caption", "code"])
      .default("body"),
    weight: z.enum(["normal", "medium", "semibold", "bold"]).default("normal"),
    align: z.enum(["left", "center", "right"]).default("left"),
  }),
});

export const ModalSchema = z.object({
  component: z.literal("Modal"),
  props: z.object({
    title: z.string(),
    description: z.string().optional(),
    open: z.boolean().default(false),
    size: z.enum(["sm", "md", "lg", "xl", "full"]).default("md"),
  }),
  children: z.array(z.lazy((): z.ZodType => ComponentSchema)).optional(),
});

// ── Component Registry (Union of all components) ───────────────────
// This is the master schema. AI agents use this to validate any component tree.

export const ComponentSchema: z.ZodType = z.discriminatedUnion("component", [
  ButtonSchema,
  InputSchema,
  CardSchema,
  StackSchema,
  TextSchema,
  ModalSchema,
]);

export type Button = z.infer<typeof ButtonSchema>;
export type Input = z.infer<typeof InputSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Stack = z.infer<typeof StackSchema>;
export type Text = z.infer<typeof TextSchema>;
export type Modal = z.infer<typeof ModalSchema>;
export type Component = z.infer<typeof ComponentSchema>;

// ── Component Catalog (for AI agent discovery) ─────────────────────

export const ComponentCatalog = {
  Button: ButtonSchema,
  Input: InputSchema,
  Card: CardSchema,
  Stack: StackSchema,
  Text: TextSchema,
  Modal: ModalSchema,
} as const;

export type ComponentName = keyof typeof ComponentCatalog;
