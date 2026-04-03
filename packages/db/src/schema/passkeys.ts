import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

/**
 * Users table -- core identity record.
 *
 * Uses LibSQL/Turso-compatible column types (text, integer, blob).
 * The `id` is a UUID v4 generated at creation time.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Passkey credentials table -- stores WebAuthn/FIDO2 credential data.
 *
 * Each user can register multiple passkeys (e.g. phone + laptop + security key).
 * The `credentialId` is the base64url-encoded credential identifier from the authenticator.
 * The `publicKey` is stored as a binary blob (COSE key).
 * The `counter` is the signature counter used for cloning detection.
 * Transports are stored as a JSON-serialized string array (e.g. '["internal","hybrid"]').
 */
export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull().default(0),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceType: text("device_type", {
    enum: ["singleDevice", "multiDevice"],
  }).notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  /** JSON-serialized array of AuthenticatorTransportFuture, or null if unknown */
  transports: text("transports"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
