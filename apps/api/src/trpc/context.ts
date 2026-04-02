import type { Context } from "hono";

export interface TRPCContext {
  db: Record<string, unknown>;
}

export function createContext(_c: Context): TRPCContext {
  return {
    db: {},
  };
}
