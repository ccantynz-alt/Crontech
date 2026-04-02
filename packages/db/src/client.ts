import { createClient as createLibSQLClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function createClient(url: string, authToken?: string) {
  const clientConfig: Parameters<typeof createLibSQLClient>[0] = { url };
  if (authToken) {
    clientConfig.authToken = authToken;
  }
  const client = createLibSQLClient(clientConfig);

  return drizzle(client, { schema });
}

// Default client - configured via environment variables
export const db = createClient(
  process.env["DATABASE_URL"] ?? "file:local.db",
  process.env["DATABASE_AUTH_TOKEN"],
);
