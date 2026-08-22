ALTER TABLE `users` ADD `centerName` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bundles` ADD `candidateDob` text;--> statement-breakpoint
ALTER TABLE `bundles` ADD `idempotencyKey` text;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `className` text;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `setNumber` text;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `bundleLabel` text;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `expectedQuestionCount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `qrStatus` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `qrSchemaVersion` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `qrIssuedAt` integer;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `qrExpiresAt` integer;
