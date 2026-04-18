-- BLK-029 Airalo eSIM reseller — `esim_orders` + `esim_packages_cache`.
-- Persists every eSIM data plan Crontech has sold on a customer's behalf
-- via the Airalo Partner API. Wholesale cost + retail markup are captured
-- at sale time (microdollars) so revenue reporting never re-queries Airalo.
-- `esim_packages_cache` is an additive, lightweight read-through cache of
-- the Airalo package catalogue used by the public pricing pages.
-- Additive only: no existing table or column is touched or dropped.
--
-- See packages/db/src/schema.ts (esimOrders, esimPackagesCache) for the
-- Drizzle shape and apps/api/src/trpc/procedures/esim.ts for the router
-- that writes these rows.

CREATE TABLE IF NOT EXISTS `esim_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `package_id` text NOT NULL,
  `airalo_order_id` text NOT NULL,
  `country_code` text,
  `data_gb` integer DEFAULT 0 NOT NULL,
  `validity_days` integer DEFAULT 0 NOT NULL,
  `cost_microdollars` integer DEFAULT 0 NOT NULL,
  `markup_microdollars` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `iccid` text,
  `lpa_string` text,
  `qr_code_data_url` text,
  `purchased_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `esim_orders_user_idx` ON `esim_orders` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `esim_orders_airalo_idx` ON `esim_orders` (`airalo_order_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `esim_orders_status_idx` ON `esim_orders` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `esim_orders_country_idx` ON `esim_orders` (`country_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `esim_packages_cache` (
  `id` text PRIMARY KEY NOT NULL,
  `airalo_package_id` text NOT NULL,
  `country_code` text,
  `name` text NOT NULL,
  `data_gb` integer DEFAULT 0 NOT NULL,
  `validity_days` integer DEFAULT 0 NOT NULL,
  `wholesale_microdollars` integer DEFAULT 0 NOT NULL,
  `last_synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `esim_packages_cache_airalo_id_unique` ON `esim_packages_cache` (`airalo_package_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `esim_packages_cache_country_idx` ON `esim_packages_cache` (`country_code`);
