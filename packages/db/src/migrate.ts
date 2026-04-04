import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import * as neonSchema from "./neon-schema";

/**
 * Runs pending Drizzle migrations against the Neon PostgreSQL database.
 *
 * Reads the NEON_DATABASE_URL from the environment or accepts it as a parameter.
 * Migrations are read from the `./migrations` folder relative to this file.
 */
export async function runMigrations(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env["NEON_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "NEON_DATABASE_URL is required. Set it in your environment or pass it directly.",
    );
  }

  const sql = neon(url);
  const db = drizzle({ client: sql, schema: neonSchema });

  const migrationsFolder = new URL("./migrations", import.meta.url).pathname;

  console.log("Running migrations from:", migrationsFolder);

  await migrate(db, { migrationsFolder });

  console.log("Migrations complete.");
}

// Allow running directly via `bun run packages/db/src/migrate.ts`
if (import.meta.main) {
  runMigrations()
    .then(() => {
      console.log("Migration finished successfully.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
