-- Add expanded role enum to users (SQLite text columns accept any value; the
-- enum constraint lives in the application layer via Drizzle/Zod).
-- We still add a CHECK constraint for defense-in-depth.

-- Step 1: Create role_permissions table
CREATE TABLE `role_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('owner', 'admin', 'editor', 'viewer', 'billing_admin')),
	`permission` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `role_permissions_role_idx` ON `role_permissions` (`role`);
--> statement-breakpoint
CREATE INDEX `role_permissions_role_perm_idx` ON `role_permissions` (`role`, `permission`);
--> statement-breakpoint

-- Step 2: Create team_members table
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('owner', 'admin', 'editor', 'viewer', 'billing_admin')),
	`invited_by` text,
	`invited_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_members_team_idx` ON `team_members` (`team_id`);
--> statement-breakpoint
CREATE INDEX `team_members_user_idx` ON `team_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `team_members_team_user_idx` ON `team_members` (`team_id`, `user_id`);
--> statement-breakpoint

-- Step 3: Add hash chain columns to audit_logs if they don't already exist.
-- The schema already defines previous_hash and entry_hash, but existing rows may
-- not have them populated. We add an index on entry_hash for chain lookups.
CREATE INDEX IF NOT EXISTS `audit_logs_entry_hash_idx` ON `audit_logs` (`entry_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_timestamp_idx` ON `audit_logs` (`timestamp`);
