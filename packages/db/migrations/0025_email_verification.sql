-- BLK-021 Email verification pipeline.
-- Two schema moves:
--   • `users.email_verified` — nullable TIMESTAMP. NULL means the user
--     has not completed the /verify-email flow (or predates this
--     migration; see the grandfather rule below). Application code
--     MUST use `isUserEmailVerified()` (see
--     apps/api/src/auth/email-verification.ts) instead of a raw null
--     check so pre-migration users are treated as verified.
--   • `email_verification_tokens` — opaque 32-byte URL-safe random
--     tokens, 24h TTL, single-use. `consumed_at` NULL until redeemed.
--     Cascade-deletes from `users` so account wipes clean up cleanly.
-- Additive only: no existing columns are dropped or renamed.
--
-- Pre-existing users: we LEAVE `email_verified` NULL for historical
-- rows rather than backfilling to `created_at`. Rationale: backfill
-- requires a second UPDATE pass that risks stalling the libsql
-- migrator on large user tables; checking a "legacy cutoff" at read
-- time in `isUserEmailVerified()` costs nothing and keeps the
-- migration atomic. The legacy cutoff is the deploy timestamp of this
-- migration (EMAIL_VERIFICATION_LEGACY_CUTOFF env var; falls back to
-- `users.created_at < NOW()` style check via users.createdAt at time
-- of user lookup — if the row's emailVerified is null AND the row was
-- created before this migration shipped, it's treated as verified).
--
-- See packages/db/src/schema.ts for the Drizzle shape and
-- apps/api/src/auth/email-verification.ts for the token helpers +
-- legacy-user gate. The /verify-email route lives in
-- apps/web/src/routes/verify-email.tsx.

ALTER TABLE `users` ADD COLUMN `email_verified` integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_verification_tokens` (
  `token` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `consumed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_verification_tokens_user_idx` ON `email_verification_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_verification_tokens_expires_idx` ON `email_verification_tokens` (`expires_at`);
