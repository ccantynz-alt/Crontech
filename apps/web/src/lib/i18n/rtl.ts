/**
 * RTL (Right-to-Left) layout utilities for i18n support.
 * Handles Arabic, Hebrew, and other RTL languages.
 */

/** Locales that use right-to-left text direction */
const RTL_LOCALES: ReadonlySet<string> = new Set([
  "ar", // Arabic
  "he", // Hebrew
  "fa", // Persian / Farsi
  "ur", // Urdu
  "ps", // Pashto
  "sd", // Sindhi
  "yi", // Yiddish
  "dv", // Divehi / Maldivian
  "ku", // Kurdish (Sorani)
  "ckb", // Central Kurdish
  "syr", // Syriac
]);

/**
 * Determines if a given locale uses right-to-left text direction.
 *
 * @param locale - BCP 47 language tag (e.g. "ar", "en", "he")
 * @returns true if the locale is RTL
 */
export function isRTL(locale: string): boolean {
  // Extract the primary language subtag (e.g. "ar" from "ar-EG")
  const primaryTag = locale.split("-")[0]?.toLowerCase() ?? "";
  return RTL_LOCALES.has(primaryTag);
}

/**
 * Returns the text direction for a given locale.
 *
 * @param locale - BCP 47 language tag (e.g. "ar", "en", "zh")
 * @returns "rtl" for right-to-left locales, "ltr" otherwise
 */
export function getDirection(locale: string): "ltr" | "rtl" {
  return isRTL(locale) ? "rtl" : "ltr";
}

/**
 * CSS logical property mappings for RTL-aware layouts.
 * Use these instead of physical properties (left/right) to ensure
 * layouts work correctly in both LTR and RTL contexts.
 *
 * CSS logical properties are natively supported in modern browsers
 * and automatically flip based on the document's `dir` attribute.
 */
export const logicalProperties = {
  // Margin
  marginInlineStart: "margin-inline-start",
  marginInlineEnd: "margin-inline-end",
  marginBlockStart: "margin-block-start",
  marginBlockEnd: "margin-block-end",

  // Padding
  paddingInlineStart: "padding-inline-start",
  paddingInlineEnd: "padding-inline-end",
  paddingBlockStart: "padding-block-start",
  paddingBlockEnd: "padding-block-end",

  // Positioning
  insetInlineStart: "inset-inline-start",
  insetInlineEnd: "inset-inline-end",
  insetBlockStart: "inset-block-start",
  insetBlockEnd: "inset-block-end",

  // Border
  borderInlineStart: "border-inline-start",
  borderInlineEnd: "border-inline-end",
  borderBlockStart: "border-block-start",
  borderBlockEnd: "border-block-end",

  // Border radius
  borderStartStartRadius: "border-start-start-radius",
  borderStartEndRadius: "border-start-end-radius",
  borderEndStartRadius: "border-end-start-radius",
  borderEndEndRadius: "border-end-end-radius",

  // Size
  inlineSize: "inline-size",
  blockSize: "block-size",
  minInlineSize: "min-inline-size",
  maxInlineSize: "max-inline-size",
  minBlockSize: "min-block-size",
  maxBlockSize: "max-block-size",

  // Text alignment
  textAlignStart: "start",
  textAlignEnd: "end",
} as const;

/** Type for CSS logical property keys */
export type LogicalProperty = keyof typeof logicalProperties;

/**
 * Sets the `dir` and `lang` attributes on the document's root element.
 * Should be called whenever the locale changes to ensure proper
 * RTL/LTR rendering and CSS logical property behavior.
 *
 * @param locale - BCP 47 language tag (e.g. "ar", "en", "zh")
 */
export function setDocumentDirection(locale: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const dir = getDirection(locale);
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;
}

/**
 * Returns a Tailwind-compatible class string for RTL-aware styling.
 * Maps a logical direction to the appropriate Tailwind utility prefix.
 *
 * @example
 * ```tsx
 * <div class={`${rtlClass("ms", "4")} ${rtlClass("me", "2")}`}>
 *   // margin-inline-start: 1rem; margin-inline-end: 0.5rem;
 * </div>
 * ```
 *
 * @param property - Tailwind logical property shorthand (ms, me, ps, pe, etc.)
 * @param value - Tailwind spacing/size value
 * @returns Tailwind class string
 */
export function rtlClass(
  property: "ms" | "me" | "ps" | "pe" | "start" | "end",
  value: string,
): string {
  return `${property}-${value}`;
}
