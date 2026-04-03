/**
 * Accessibility configuration for WCAG 2.2 AA compliance.
 * Used with axe-core for automated a11y testing.
 */

/** axe-core rule IDs enforced at WCAG 2.2 AA level */
export const a11yRules: readonly string[] = [
  // Perceivable
  "image-alt",
  "input-image-alt",
  "area-alt",
  "object-alt",
  "svg-img-alt",
  "role-img-alt",
  "color-contrast",
  "color-contrast-enhanced",
  "video-caption",
  "audio-caption",
  "meta-viewport",
  "meta-viewport-large",
  "label",
  "label-title-only",

  // Operable
  "keyboard",
  "no-trap",
  "focus-order-semantics",
  "tabindex",
  "skip-link",
  "bypass",
  "frame-title",
  "page-has-heading-one",

  // Understandable
  "html-has-lang",
  "html-lang-valid",
  "html-xml-lang-mismatch",
  "valid-lang",
  "autocomplete-valid",
  "form-field-multiple-labels",

  // Robust
  "aria-valid-attr",
  "aria-valid-attr-value",
  "aria-allowed-attr",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-hidden-body",
  "aria-hidden-focus",
  "duplicate-id",
  "duplicate-id-aria",

  // Structure
  "document-title",
  "region",
  "landmark-one-main",
  "landmark-no-duplicate-main",
  "landmark-unique",
  "list",
  "listitem",
  "definition-list",
  "dlitem",
  "table-duplicate-name",
  "td-headers-attr",
  "th-has-data-cells",

  // Links & buttons
  "link-name",
  "button-name",
  "link-in-text-block",
] as const;

/** WCAG 2.2 AA rule configuration for axe-core */
export interface A11yConfig {
  /** axe-core run options */
  runOnly: {
    type: "tag";
    values: string[];
  };
  /** Rule overrides */
  rules: Record<string, { enabled: boolean }>;
  /** Result types to include */
  resultTypes: string[];
}

/**
 * Returns a complete axe-core configuration object
 * targeting WCAG 2.2 AA compliance.
 */
export function getA11yConfig(): A11yConfig {
  const rules: Record<string, { enabled: boolean }> = {};
  for (const rule of a11yRules) {
    rules[rule] = { enabled: true };
  }

  return {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag22aa", "best-practice"],
    },
    rules,
    resultTypes: ["violations", "incomplete"],
  };
}
