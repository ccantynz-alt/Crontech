-- Auth challenge persistence: replaces the in-memory Map in auth.ts.
-- Challenges are short-lived (5 min TTL). The expires_at index lets
-- the periodic cleanup DELETE efficiently without a full table scan.
CREATE TABLE IF NOT EXISTS `auth_challenges` (
  `key` text PRIMARY KEY NOT NULL,
  `challenge` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_challenges_expires_idx` ON `auth_challenges` (`expires_at`);
