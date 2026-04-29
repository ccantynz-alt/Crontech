// ── Tenant Database Lifecycle Manager ────────────────────────────────
// Manages provisioning, suspension, deletion, and health checks for
// per-tenant Neon PostgreSQL databases.

import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { db } from "./client";
import { createTenantProject, deleteTenantProject as deleteNeonProject } from "./neon-provisioning";
import { tenantProjects } from "./schema";

export type TenantProject = typeof tenantProjects.$inferSelect;

type DrizzleClient = ReturnType<typeof drizzle>;

/**
 * Provision a new Neon database for a tenant.
 * Called when a user upgrades to Pro or Enterprise.
 */
export async function provisionTenantDB(
  userId: string,
  plan: "free" | "pro" | "enterprise",
  region?: string,
): Promise<TenantProject> {
  // Check if tenant already has a project
  const existing = await db.query.tenantProjects.findFirst({
    where: eq(tenantProjects.userId, userId),
  });

  if (existing) {
    // If suspended, reactivate
    if (existing.status === "suspended") {
      const now = new Date();
      await db
        .update(tenantProjects)
        .set({
          status: "active",
          plan,
          updatedAt: now,
        })
        .where(eq(tenantProjects.id, existing.id));

      return {
        ...existing,
        status: "active",
        plan,
        updatedAt: now,
      };
    }

    // Already provisioned or provisioning
    return existing;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  // Insert a record in "provisioning" state
  await db.insert(tenantProjects).values({
    id,
    userId,
    neonProjectId: "", // Will be updated after Neon API call
    connectionUri: "",
    region: region ?? "aws-us-east-2",
    status: "provisioning",
    plan,
    createdAt: now,
    updatedAt: now,
  });

  try {
    // Create the Neon project
    const neonProject = await createTenantProject(userId, region);

    // Update with real Neon details
    await db
      .update(tenantProjects)
      .set({
        neonProjectId: neonProject.id,
        connectionUri: neonProject.connectionUri,
        region: neonProject.region,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(tenantProjects.id, id));

    return {
      id,
      userId,
      neonProjectId: neonProject.id,
      connectionUri: neonProject.connectionUri,
      region: neonProject.region,
      status: "active",
      plan,
      createdAt: now,
      updatedAt: new Date(),
    };
  } catch (error: unknown) {
    // Mark as failed but keep the record so we can retry
    await db
      .update(tenantProjects)
      .set({
        status: "suspended",
        updatedAt: new Date(),
      })
      .where(eq(tenantProjects.id, id));

    const message = error instanceof Error ? error.message : "Unknown provisioning error";
    throw new Error(`Failed to provision tenant database: ${message}`);
  }
}

/**
 * Suspend a tenant's database.
 * Called when a user downgrades to Free.
 * The Neon project is kept but marked as suspended.
 */
export async function suspendTenantDB(userId: string): Promise<void> {
  const project = await db.query.tenantProjects.findFirst({
    where: eq(tenantProjects.userId, userId),
  });

  if (!project) {
    return; // No project to suspend
  }

  await db
    .update(tenantProjects)
    .set({
      status: "suspended",
      updatedAt: new Date(),
    })
    .where(eq(tenantProjects.id, project.id));
}

/**
 * Delete a tenant's database entirely.
 * Called when a user deletes their account.
 * Removes both the Neon project and the local record.
 */
export async function deleteTenantDB(userId: string): Promise<void> {
  const project = await db.query.tenantProjects.findFirst({
    where: eq(tenantProjects.userId, userId),
  });

  if (!project) {
    return; // No project to delete
  }

  // Mark as deleting first
  await db
    .update(tenantProjects)
    .set({
      status: "deleting",
      updatedAt: new Date(),
    })
    .where(eq(tenantProjects.id, project.id));

  try {
    // Delete the Neon project if it was provisioned
    if (project.neonProjectId) {
      await deleteNeonProject(project.neonProjectId);
    }
  } catch (error: unknown) {
    // Log but continue with local cleanup
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[tenant-manager] Failed to delete Neon project ${project.neonProjectId}: ${message}`,
    );
  }

  // Remove the local record
  await db.delete(tenantProjects).where(eq(tenantProjects.id, project.id));
}

/**
 * Get a Drizzle client connected to a specific tenant's Neon database.
 * Returns null if the tenant has no active database.
 */
export async function getTenantClient(userId: string): Promise<DrizzleClient | null> {
  const project = await db.query.tenantProjects.findFirst({
    where: eq(tenantProjects.userId, userId),
  });

  if (!project || project.status !== "active" || !project.connectionUri) {
    return null;
  }

  const sql = neon(project.connectionUri);
  return drizzle({ client: sql });
}

/**
 * Check the health of a tenant's database connection.
 * Returns status and latency.
 */
export async function checkTenantHealth(
  userId: string,
): Promise<{ status: string; latencyMs: number; error?: string }> {
  const project = await db.query.tenantProjects.findFirst({
    where: eq(tenantProjects.userId, userId),
  });

  if (!project) {
    return { status: "not_provisioned", latencyMs: 0 };
  }

  if (project.status !== "active") {
    return { status: project.status, latencyMs: 0 };
  }

  if (!project.connectionUri) {
    return { status: "no_connection", latencyMs: 0 };
  }

  const start = performance.now();
  try {
    const sql = neon(project.connectionUri);
    await sql`SELECT 1 as health_check`;
    return {
      status: "healthy",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error: unknown) {
    return {
      status: "unhealthy",
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get tenant project info for a user (without sensitive connection string).
 */
export async function getTenantProjectInfo(userId: string): Promise<TenantProject | null> {
  const project = await db.query.tenantProjects.findFirst({
    where: eq(tenantProjects.userId, userId),
  });

  return project ?? null;
}
