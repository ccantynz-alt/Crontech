import { createContext, useContext } from "solid-js";
import type { JSX } from "solid-js";
import { createI18n, type Locale } from "./index";

type I18nContextValue = ReturnType<typeof createI18n>;

const I18nContext = createContext<I18nContextValue>();

/**
 * Provides i18n context to the component tree.
 */
export function I18nProvider(props: {
  locale?: Locale;
  children: JSX.Element;
}): JSX.Element {
  const i18n = createI18n(props.locale ?? "en");
  return I18nContext.Provider({
    value: i18n,
    get children() {
      return props.children;
    },
  });
}

/**
 * Access the i18n context from any descendant component.
 * Must be used within an I18nProvider.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
