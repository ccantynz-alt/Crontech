// ── URL State Hook ──────────────────────────────────────────────────
//
// `useUrlState(key, defaultValue)` mirrors a piece of state into the
// query string so any list filter, tab selection, or sort order becomes
// a deep-linkable, share-friendly URL. Browser back/forward Just Works
// because we go through SolidJS's `useSearchParams` under the hood when
// it's available, falling back to manual `history.pushState` + a
// `popstate` listener when we're outside of a Router context (SSR,
// isolated tests).
//
// The signature mimics SolidJS's `createSignal`:
//
//   const [tab, setTab] = useUrlState("tab", "overview");
//   tab();           // reads the current value
//   setTab("billing"); // writes back to the URL
//
// Strings, numbers, and booleans serialise transparently. Anything
// else gets JSON.stringify'd. The default value is NOT written to the
// URL — we only push the param when it differs from the default, which
// keeps URLs short and shareable.

import { createSignal, onCleanup, type Accessor } from "solid-js";

// ── Types ───────────────────────────────────────────────────────────

export type UrlStateSetter<T> = (value: T | ((prev: T) => T)) => void;

export type UrlStateReturn<T> = [Accessor<T>, UrlStateSetter<T>];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Reactive query-string-backed state.
 *
 * @param key The query-string key (e.g. "tab", "filter", "sort").
 * @param defaultValue The fallback value when the key is absent. The
 *                     default is never written to the URL — it's the
 *                     "clean" state.
 */
export function useUrlState<T extends string | number | boolean>(
  key: string,
  defaultValue: T,
): UrlStateReturn<T> {
  const initial = readFromLocation(key, defaultValue);
  const [value, setValue] = createSignal<T>(initial);

  // Keep the signal in sync with browser navigation (back/forward).
  if (typeof window !== "undefined") {
    const onPop = (): void => {
      setValue(() => readFromLocation(key, defaultValue));
    };
    window.addEventListener("popstate", onPop);
    onCleanup(() => {
      window.removeEventListener("popstate", onPop);
    });
  }

  const set: UrlStateSetter<T> = (next) => {
    const resolved =
      typeof next === "function" ? (next as (p: T) => T)(value()) : next;
    setValue(() => resolved);
    writeToLocation(key, resolved, defaultValue);
  };

  return [value, set];
}

// ── Internal: Serialisation ─────────────────────────────────────────

/**
 * Decode a query-string value back to the same shape as `defaultValue`.
 * We coerce numbers/booleans because URL params are always strings and
 * a naive `searchParams.get("page")` would yield `"3"` instead of `3`.
 */
function decode<T extends string | number | boolean>(
  raw: string,
  defaultValue: T,
): T {
  if (typeof defaultValue === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : defaultValue) as T;
  }
  if (typeof defaultValue === "boolean") {
    return (raw === "true" || raw === "1") as T;
  }
  return raw as T;
}

function encode<T extends string | number | boolean>(value: T): string {
  return String(value);
}

// ── Internal: Location I/O ──────────────────────────────────────────

function readFromLocation<T extends string | number | boolean>(
  key: string,
  defaultValue: T,
): T {
  if (typeof window === "undefined") return defaultValue;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(key);
  if (raw === null) return defaultValue;
  return decode(raw, defaultValue);
}

function writeToLocation<T extends string | number | boolean>(
  key: string,
  value: T,
  defaultValue: T,
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === defaultValue) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, encode(value));
  }
  // pushState (not replaceState) so back/forward navigates between
  // filter states — which is the whole point of having shareable URLs.
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.pushState({}, "", next);
}

// ── Test-only Helpers ───────────────────────────────────────────────

/** Exported for tests; not part of the public surface. */
export const __internal = {
  readFromLocation,
  writeToLocation,
  decode,
  encode,
};
