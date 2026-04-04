import { createClient } from "./client";
import { users, sites } from "./schema";

/**
 * Seeds the development database with a test user and a sample site.
 *
 * Uses the Turso/libSQL client (the primary edge database).
 * Set DATABASE_URL and optionally DATABASE_AUTH_TOKEN in your environment.
 */
export async function seed(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env["DATABASE_URL"] ?? "file:local.db";
  const authToken = process.env["DATABASE_AUTH_TOKEN"];
  const db = createClient(url, authToken);

  const testUserId = "00000000-0000-0000-0000-000000000001";
  const testSiteId = "00000000-0000-0000-0000-000000000010";

  console.log("Seeding test user...");

  await db
    .insert(users)
    .values({
      id: testUserId,
      email: "dev@backtothe.future",
      displayName: "Dev User",
      role: "admin",
    })
    .onConflictDoNothing();

  console.log("Seeding sample site...");

  await db
    .insert(sites)
    .values({
      id: testSiteId,
      userId: testUserId,
      name: "My First Site",
      slug: "my-first-site",
      description: "A sample site created by the seed script.",
      pageLayout: JSON.stringify({
        sections: [
          { type: "hero", title: "Welcome", subtitle: "Built with Back to the Future" },
          { type: "content", body: "This is a sample page layout." },
        ],
      }),
      status: "draft",
    })
    .onConflictDoNothing();

  console.log("Seed complete.");
}

// Allow running directly via `bun run packages/db/src/seed.ts`
if (import.meta.main) {
  seed()
    .then(() => {
      console.log("Seed finished successfully.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}
