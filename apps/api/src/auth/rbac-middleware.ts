import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, users } from "@cronix/db";
import {
  type Permission,
  type Role,
  roleHasAllPermissions,
  roleHasAnyPermission,
  RoleSchema,
} from "./permissions";

export interface RbacEnv {
  Variables: {
    userId: string | null;
    userRole: Role | null;
  };
}

// ---------------------------------------------------------------------------
// Internal: Resolve the user's role from the database
// ---------------------------------------------------------------------------

async function resolveUserRole(userId: string): Promise<Role | null> {
  const result = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];
  if (!user) return null;

  const parsed = RoleSchema.safeParse(user.role);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// requirePermission — user must have ALL listed permissions
// ---------------------------------------------------------------------------

export function requirePermission(...permissions: Permission[]) {
  return createMiddleware<RbacEnv>(async (c, next) => {
    const userId = c.get("userId");
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const role = await resolveUserRole(userId);
    if (!role) {
      return c.json({ error: "User not found or role missing" }, 403);
    }

    if (!roleHasAllPermissions(role, permissions)) {
      return c.json(
        {
          error: "Forbidden",
          required: permissions,
          message: "You do not have all required permissions for this action.",
        },
        403,
      );
    }

    c.set("userRole", role);
    await next();
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// requireAnyPermission — user must have at least ONE listed permission
// ---------------------------------------------------------------------------

export function requireAnyPermission(...permissions: Permission[]) {
  return createMiddleware<RbacEnv>(async (c, next) => {
    const userId = c.get("userId");
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const role = await resolveUserRole(userId);
    if (!role) {
      return c.json({ error: "User not found or role missing" }, 403);
    }

    if (!roleHasAnyPermission(role, permissions)) {
      return c.json(
        {
          error: "Forbidden",
          required: permissions,
          message:
            "You do not have any of the required permissions for this action.",
        },
        403,
      );
    }

    c.set("userRole", role);
    await next();
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// requireRole — user must have one of the listed roles
// ---------------------------------------------------------------------------

export function requireRole(...roles: Role[]) {
  return createMiddleware<RbacEnv>(async (c, next) => {
    const userId = c.get("userId");
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const role = await resolveUserRole(userId);
    if (!role) {
      return c.json({ error: "User not found or role missing" }, 403);
    }

    if (!roles.includes(role)) {
      return c.json(
        {
          error: "Forbidden",
          required: roles,
          message: "Your role does not have access to this resource.",
        },
        403,
      );
    }

    c.set("userRole", role);
    await next();
    return undefined;
  });
}
