import type { Context } from "hono";
import { db } from "@back-to-the-future/db";

type Database = typeof db;

export interface TRPCContext {
  db: Database;
}

export function createContext(_c: Context): TRPCContext {
  return {
    db,
  };
}
