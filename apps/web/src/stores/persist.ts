// ── Persisted Signal Utility ─────────────────────────────────────────
// Creates a SolidJS signal that automatically persists to localStorage.
// SSR-safe: gracefully falls back when window/localStorage is unavailable.

import { type Accessor, type Setter, createEffect, createSignal } from "solid-js";

// ── Helpers ──────────────────────────────────────────────────────────

const isServer = typeof window === "undefined";

function tryGetItem(key: string): string | null {
  if (isServer) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function trySetItem(key: string, value: string): void {
  if (isServer) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable -- silently fail
  }
}

function tryRemoveItem(key: string): void {
  if (isServer) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable -- silently fail
  }
}

// ── Serialization ────────────────────────────────────────────────────

interface Serializer<T> {
  serialize: (value: T) => string;
  deserialize: (raw: string) => T;
}

const jsonSerializer: Serializer<unknown> = {
  serialize: (value: unknown): string => JSON.stringify(value),
  deserialize: (raw: string): unknown => JSON.parse(raw) as unknown,
};

// ── Public API ───────────────────────────────────────────────────────

export interface PersistedSignalOptions<T> {
  /** Custom serializer/deserializer. Defaults to JSON. */
  serializer?: Serializer<T>;
  /** Validate the deserialized value. Return false to discard and use defaultValue. */
  validate?: (value: unknown) => value is T;
}

export interface PersistedSignal<T> {
  /** Reactive accessor for the current value. */
  get: Accessor<T>;
  /** Setter to update the value (also persists to localStorage). */
  set: Setter<T>;
  /** Remove the persisted value and reset to defaultValue. */
  clear: () => void;
}

/**
 * Creates a SolidJS signal that automatically persists to localStorage.
 *
 * - Restores from localStorage on initialization (if a valid value exists).
 * - Writes to localStorage on every change via createEffect.
 * - SSR-safe: returns defaultValue on the server, no localStorage access.
 *
 * @param key - localStorage key
 * @param defaultValue - fallback when no stored value exists or deserialization fails
 * @param options - optional serializer and validator
 *
 * @example
 * ```ts
 * const theme = createPersistedSignal("btf_theme", "light" as const);
 * theme.get(); // "light" (or restored value)
 * theme.set("dark");
 * theme.clear(); // resets to "light" and removes from storage
 * ```
 */
export function createPersistedSignal<T>(
  key: string,
  defaultValue: T,
  options?: PersistedSignalOptions<T>,
): PersistedSignal<T> {
  const serializer = (options?.serializer ?? jsonSerializer) as Serializer<T>;
  const validate = options?.validate;

  // Attempt to restore from localStorage
  let initial: T = defaultValue;
  const raw = tryGetItem(key);
  if (raw !== null) {
    try {
      const parsed: unknown = serializer.deserialize(raw);
      if (validate) {
        if (validate(parsed)) {
          initial = parsed;
        }
      } else {
        initial = parsed as T;
      }
    } catch {
      // Corrupted data -- fall through to defaultValue
    }
  }

  const [value, setValue] = createSignal<T>(initial);

  // Persist on every change
  createEffect((): void => {
    const current = value();
    trySetItem(key, serializer.serialize(current));
  });

  function clear(): void {
    tryRemoveItem(key);
    setValue(() => defaultValue);
  }

  return {
    get: value,
    set: setValue,
    clear,
  };
}
