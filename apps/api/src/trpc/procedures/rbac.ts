import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import { users } from "@cronix/db";
import type { Database } from "@cronix/db";
import { teamMembers } from "@cronix/db/rbac-schema";
import {
  type Permission,
  type Role,
  RoleSchema,
  getPermissionsForRole,
  roleHasAllPermissions,
} from "../../auth/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserRole(
  db: Database,
  userId: string,
): Promise<Role> {
  const result = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  const parsed = RoleSchema.safeParse(user.role);
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "User has invalid role",
    });
  }
  return parsed.data;
}

function assertPermission(role: Role, ...permissions: Permission[]): void {
  if (!roleHasAllPermissions(role, permissions)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Missing required permissions: ${permissions.join(", ")}`,
    });
  }
}

// ---------------------------------------------------------------------------
// RBAC Router
// ---------------------------------------------------------------------------

export const rbacRouter = router({
  /**
   * Get the current user's permissions based on their role.
   */
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    const role = await getUserRole(ctx.db, ctx.userId);
    const permissions = getPermissionsForRole(role);
    return { role, permissions: [...permissions] };
  }),

  /**
   * Get team members with their roles.
   * Requires team:manage_roles or team:invite permission.
   */
  getTeamMembers: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const role = await getUserRole(ctx.db, ctx.userId);
      assertPermission(role, "team:invite");

      const members = await ctx.db
        .select({
          id: teamMembers.id,
          teamId: teamMembers.teamId,
          userId: teamMembers.userId,
          role: teamMembers.role,
          invitedBy: teamMembers.invitedBy,
          invitedAt: teamMembers.invitedAt,
          acceptedAt: teamMembers.acceptedAt,
          userEmail: users.email,
          userDisplayName: users.displayName,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId))
        .orderBy(desc(teamMembers.invitedAt));

      return members;
    }),

  /**
   * Invite a user to a team with a role assignment.
   * Requires team:invite permission.
   */
  inviteMember: protectedProcedure
    .input(
      z.object({
        teamId: z.string().min(1),
        email: z.string().email(),
        role: RoleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const callerRole = await getUserRole(ctx.db, ctx.userId);
      assertPermission(callerRole, "team:invite");

      // Find the user by email
      const userResult = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      const targetUser = userResult[0];
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No user found with email: ${input.email}`,
        });
      }

      // Check if already a member
      const existing = await ctx.db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, input.teamId),
            eq(teamMembers.userId, targetUser.id),
          ),
        )
        .limit(1);

      if (existing[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this team",
        });
      }

      const id = crypto.randomUUID();
      const now = new Date();

      const result = await ctx.db
        .insert(teamMembers)
        .values({
          id,
          teamId: input.teamId,
          userId: targetUser.id,
          role: input.role,
          invitedBy: ctx.userId,
          invitedAt: now,
          acceptedAt: null,
        })
        .returning();

      const created = result[0];
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create team member",
        });
      }

      return created;
    }),

  /**
   * Update a team member's role.
   * Requires team:manage_roles permission.
   */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string().min(1),
        role: RoleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const callerRole = await getUserRole(ctx.db, ctx.userId);
      assertPermission(callerRole, "team:manage_roles");

      const result = await ctx.db
        .update(teamMembers)
        .set({ role: input.role })
        .where(eq(teamMembers.id, input.memberId))
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Team member not found: ${input.memberId}`,
        });
      }

      return updated;
    }),

  /**
   * Remove a member from a team.
   * Requires team:remove permission.
   */
  removeMember: protectedProcedure
    .input(z.object({ memberId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const callerRole = await getUserRole(ctx.db, ctx.userId);
      assertPermission(callerRole, "team:remove");

      const result = await ctx.db
        .delete(teamMembers)
        .where(eq(teamMembers.id, input.memberId))
        .returning();

      const deleted = result[0];
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Team member not found: ${input.memberId}`,
        });
      }

      return { success: true as const, id: input.memberId };
    }),
});
