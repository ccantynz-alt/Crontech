// ── Project Analyzer ───────────────────────────────────────────────
// Takes a component tree and returns improvement suggestions in plain English.
// Demo mode (no key needed) uses smart rule-based heuristics.
// With an API key, the same shape is produced by an LLM (future).

import type { Component } from "@back-to-the-future/schemas";

export type SuggestionSeverity = "info" | "tip" | "warning";

export interface ProjectSuggestion {
  id: string;
  title: string;
  description: string;
  severity: SuggestionSeverity;
  // A machine-readable hint for how to apply the fix automatically.
  fix: {
    kind: "add" | "modify" | "remove";
    target?: string;
    component?: Component;
  };
}

// Local structural type used for traversal.
// ComponentSchema is annotated as z.ZodType (without a type parameter) so
// z.infer resolves to unknown. This interface captures the minimum shape we
// need for rule evaluation without requiring the schemas package to be rebuilt.
interface AnyComponent {
  component: string;
  props: Record<string, unknown>;
  children?: AnyComponent[];
}

function flatten(tree: AnyComponent[] | undefined): AnyComponent[] {
  const out: AnyComponent[] = [];
  if (!tree) return out;
  const visit = (node: AnyComponent): void => {
    out.push(node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return out;
}

function hasComponent(tree: AnyComponent[], name: string): boolean {
  return flatten(tree).some((c) => c.component === name);
}

function hasButtonLike(tree: AnyComponent[], keywords: string[]): boolean {
  return flatten(tree).some((c) => {
    if (c.component !== "Button") return false;
    const label = (c.props["label"] as string | undefined)?.toLowerCase() ?? "";
    return keywords.some((k) => label.includes(k));
  });
}

export function analyzeProject(tree: Component[]): ProjectSuggestion[] {
  // Cast to the local traversal type; Component resolves to unknown at the
  // type level due to z.ZodType on ComponentSchema, but the runtime shape is
  // identical to AnyComponent.
  const nodes = tree as unknown as AnyComponent[];
  const suggestions: ProjectSuggestion[] = [];

  // Rule 1: Missing CTA
  if (!hasButtonLike(nodes, ["start", "sign up", "buy", "get", "try", "join", "contact"])) {
    suggestions.push({
      id: "missing-cta",
      title: "Your page is missing a call-to-action button.",
      description: "Visitors need an obvious next step. Want me to add a 'Get Started' button at the bottom?",
      severity: "tip",
      fix: {
        kind: "add",
        component: {
          component: "Button",
          props: { label: "Get Started", variant: "primary", size: "lg", disabled: false, loading: false },
        },
      },
    });
  }

  // Rule 2: No headline
  if (!flatten(nodes).some((c) => c.component === "Text" && (c.props["variant"] as string | undefined) === "h1")) {
    suggestions.push({
      id: "missing-headline",
      title: "There is no main headline on this page.",
      description: "Pages with a clear H1 headline convert better. Shall I add one at the top?",
      severity: "warning",
      fix: {
        kind: "add",
        component: {
          component: "Text",
          props: { content: "Welcome", variant: "h1", weight: "bold", align: "center" },
        },
      },
    });
  }

  // Rule 3: No images / avatars / visual content
  if (!hasComponent(nodes, "Avatar") && !hasComponent(nodes, "Card")) {
    suggestions.push({
      id: "needs-visuals",
      title: "This page is text-only.",
      description: "Adding visual cards or imagery makes pages feel friendlier. Want me to add a feature grid?",
      severity: "tip",
      fix: { kind: "add" },
    });
  }

  // Rule 4: No contact form
  if (!hasComponent(nodes, "Input") && !hasComponent(nodes, "Textarea")) {
    suggestions.push({
      id: "add-contact-form",
      title: "Add a contact form?",
      description: "Letting visitors reach out is one of the easiest ways to grow. Shall I add a contact form?",
      severity: "info",
      fix: {
        kind: "add",
        component: {
          component: "Input",
          props: { name: "email", type: "email", label: "Your email", required: true, disabled: false },
        },
      },
    });
  }

  // Rule 5: Spacing — too many siblings without a Stack wrapper
  if (nodes.length > 4 && !hasComponent(nodes, "Stack")) {
    suggestions.push({
      id: "needs-spacing",
      title: "This section could use better spacing.",
      description: "Wrapping your content in a Stack with consistent gaps will make it look polished. Shall I fix it?",
      severity: "tip",
      fix: { kind: "modify" },
    });
  }

  // Rule 6: Mobile-friendly check (very rough — just a recommendation)
  const wideStacks = flatten(nodes).filter(
    (c) =>
      c.component === "Stack" &&
      (c.props["direction"] as string | undefined) === "horizontal" &&
      Array.isArray(c.children) &&
      (c.children?.length ?? 0) > 3,
  );
  if (wideStacks.length > 0) {
    suggestions.push({
      id: "mobile-friendly",
      title: "Make this mobile-friendly?",
      description: "You have wide horizontal layouts that may break on phones. Want me to make them stack vertically on small screens?",
      severity: "tip",
      fix: { kind: "modify" },
    });
  }

  return suggestions;
}

// Future: AI-powered analyzer that calls LLM with the component tree.
// Falls back to rule-based when no API key is configured.
export async function analyzeProjectWithAI(tree: Component[]): Promise<ProjectSuggestion[]> {
  // Demo mode: rule-based always.
  return analyzeProject(tree);
}
