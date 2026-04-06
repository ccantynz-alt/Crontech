// ── tRPC SolidJS helpers ────────────────────────────────────────────
// Thin wrappers around createResource/createSignal that standardize
// loading/error handling for tRPC queries and mutations.

import { createResource, createSignal, type Resource } from "solid-js";
import { TRPCClientError } from "@trpc/client";

export interface UseQueryResult<T> {
  data: Resource<T>;
  refetch: () => void;
  mutate: (value: T | undefined) => void;
  loading: () => boolean;
  error: () => unknown;
}

/**
 * Wrap a tRPC query in a SolidJS resource with standardized state.
 * Usage: const users = useQuery(() => trpc.users.list.query());
 */
export function useQuery<T>(fn: () => Promise<T>): UseQueryResult<T> {
  const [data, { refetch, mutate }] = createResource<T>(fn);
  return {
    data,
    refetch: () => { void refetch(); },
    mutate: (v) => mutate(() => v),
    loading: () => data.loading,
    error: () => data.error,
  };
}

export interface UseMutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  loading: () => boolean;
  error: () => Error | null;
  reset: () => void;
}

/**
 * Wrap a tRPC mutation with standardized loading and error signals.
 * Usage:
 *   const create = useMutation((input: {name: string}) =>
 *     trpc.users.create.mutate(input));
 *   await create.mutate({name: "Alice"});
 */
export function useMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
): UseMutationResult<TInput, TOutput> {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const mutate = async (input: TInput): Promise<TOutput> => {
    setLoading(true);
    setError(null);
    try {
      return await fn(input);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const reset = (): void => {
    setError(null);
    setLoading(false);
  };

  return { mutate, loading, error, reset };
}

/**
 * Convert a thrown error into a user-friendly message (no stack traces).
 */
export function friendlyError(err: unknown): string {
  if (err instanceof TRPCClientError) {
    return err.message || "Request failed. Please try again.";
  }
  if (err instanceof Error) {
    return err.message || "Something went wrong.";
  }
  return "Something went wrong. Please try again.";
}
