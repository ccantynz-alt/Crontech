import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "editor", "viewer"] })
    .notNull()
    .default("viewer"),
  passkeyCredentialId: text("passkey_credential_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  actorId: text("actor_id").notNull(),
  actorIp: text("actor_ip"),
  actorDevice: text("actor_device"),
  action: text("action", {
    enum: ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "SIGN"],
  }).notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  detail: text("detail"),
  result: text("result", { enum: ["success", "failure"] }).notNull(),
  sessionId: text("session_id"),
  previousHash: text("previous_hash"),
  entryHash: text("entry_hash").notNull(),
  signature: text("signature"),
});
