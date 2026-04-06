-- Accounting vertical tables

CREATE TABLE `accounting_clients` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `company` text,
  `tax_id` text,
  `address` text,
  `contact_person` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `accounting_clients_user_id_idx` ON `accounting_clients` (`user_id`);

CREATE TABLE `invoices` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `client_id` text NOT NULL,
  `invoice_number` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `issue_date` integer NOT NULL,
  `due_date` integer NOT NULL,
  `subtotal` integer DEFAULT 0 NOT NULL,
  `tax_amount` integer DEFAULT 0 NOT NULL,
  `total` integer DEFAULT 0 NOT NULL,
  `currency` text DEFAULT 'USD' NOT NULL,
  `notes` text,
  `paid_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`client_id`) REFERENCES `accounting_clients`(`id`) ON DELETE cascade
);
CREATE INDEX `invoices_user_id_idx` ON `invoices` (`user_id`);
CREATE INDEX `invoices_client_id_idx` ON `invoices` (`client_id`);
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);

CREATE TABLE `invoice_line_items` (
  `id` text PRIMARY KEY NOT NULL,
  `invoice_id` text NOT NULL,
  `description` text NOT NULL,
  `quantity` integer DEFAULT 1 NOT NULL,
  `rate` integer DEFAULT 0 NOT NULL,
  `amount` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE cascade
);
CREATE INDEX `invoice_line_items_invoice_id_idx` ON `invoice_line_items` (`invoice_id`);

CREATE TABLE `expenses` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `date` integer NOT NULL,
  `vendor` text NOT NULL,
  `category` text NOT NULL,
  `amount` integer DEFAULT 0 NOT NULL,
  `currency` text DEFAULT 'USD' NOT NULL,
  `receipt_url` text,
  `deductible` integer DEFAULT true NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `expenses_user_id_idx` ON `expenses` (`user_id`);

CREATE TABLE `tax_jurisdictions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `country` text NOT NULL,
  `state` text,
  `rate` integer DEFAULT 0 NOT NULL,
  `type` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);

CREATE TABLE `journal_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `date` integer NOT NULL,
  `description` text NOT NULL,
  `total_amount` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);

CREATE TABLE `journal_entry_lines` (
  `id` text PRIMARY KEY NOT NULL,
  `journal_entry_id` text NOT NULL,
  `account_id` text NOT NULL,
  `debit` integer DEFAULT 0 NOT NULL,
  `credit` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE cascade
);

CREATE TABLE `financial_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `balance` integer DEFAULT 0 NOT NULL,
  `currency` text DEFAULT 'USD' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `financial_accounts_user_id_idx` ON `financial_accounts` (`user_id`);
