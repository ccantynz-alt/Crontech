import { createSignal } from "solid-js";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { ar } from "./locales/ar";
import { zh } from "./locales/zh";
import type { Dictionary, DictionaryKey } from "./locales/en";
import { setDocumentDirection } from "./rtl";

export type { Dictionary, DictionaryKey };

export type Locale = "en" | "es" | "ar" | "zh";

const dictionaries: Record<Locale, Dictionary> = { en, es, ar, zh };

const availableLocales: readonly Locale[] = ["en", "es", "ar", "zh"] as const;

/**
 * Creates an i18n instance with SolidJS signal-based locale tracking.
 * Supports flat key lookup via dot-notation keys defined in the dictionary.
 */
export function createI18n(initialLocale: Locale = "en") {
  const [locale, rawSetLocale] = createSignal<Locale>(initialLocale);

  // Set initial document direction
  setDocumentDirection(initialLocale);

  /**
   * Sets the active locale and updates the document direction.
   */
  function setLocale(newLocale: Locale): void {
    rawSetLocale(newLocale);
    setDocumentDirection(newLocale);
  }

  /**
   * Translate a key to the current locale's string value.
   * Falls back to English if the key is missing in the current locale,
   * and returns the key itself as a last resort.
   */
  function t(key: DictionaryKey): string {
    const currentDict = dictionaries[locale()];
    if (key in currentDict) {
      return currentDict[key];
    }
    // Fallback to English
    if (key in en) {
      return en[key];
    }
    return key;
  }

  return {
    /** Translate a dictionary key to the current locale */
    t,
    /** Reactive signal returning the current locale */
    locale,
    /** Set the active locale and update document direction */
    setLocale,
    /** List of all available locales */
    locales: availableLocales,
  } as const;
}

// Re-export RTL utilities
export { isRTL, getDirection, setDocumentDirection, logicalProperties, rtlClass } from "./rtl";
export type { LogicalProperty } from "./rtl";

// Re-export formatter utilities
export {
  formatDate,
  formatDateRange,
  formatNumber,
  formatCurrency,
  formatRelativeTime,
  formatList,
} from "./formatter";
export type {
  DateFormatOptions,
  NumberFormatOptions,
  CurrencyFormatOptions,
} from "./formatter";
