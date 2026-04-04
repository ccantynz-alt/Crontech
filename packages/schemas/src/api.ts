import { z } from "zod";

// ── API Schemas (Shared between frontend and backend via tRPC) ─────

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: z.enum(["owner", "admin", "editor", "viewer", "billing_admin"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserInput = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: z.enum(["owner", "admin", "editor", "viewer", "billing_admin"]).default("viewer"),
});

export type CreateUserInputType = z.infer<typeof CreateUserInput>;

export const PaginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PaginationInputType = z.infer<typeof PaginationInput>;

export const PaginatedResponse = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int(),
  });

// ── Environment Variables Schema ───────────────────────────────────

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
});

export type Env = z.infer<typeof EnvSchema>;
