CREATE TABLE `bundleAssignments` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`evaluatorUserId` integer NOT NULL,
	`assignedByUserId` integer NOT NULL,
	`assignedAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bundles` ADD `captureSource` text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `bundles` ADD `captureDevice` text;--> statement-breakpoint
ALTER TABLE `bundles` ADD `processingState` text DEFAULT 'captured' NOT NULL;--> statement-breakpoint
ALTER TABLE `deviations` ADD `assignedToUserId` integer;--> statement-breakpoint
ALTER TABLE `deviations` ADD `recheckMarks` integer;--> statement-breakpoint
ALTER TABLE `deviations` ADD `recheckNote` text;--> statement-breakpoint
ALTER TABLE `deviations` ADD `recheckedByUserId` integer;--> statement-breakpoint
ALTER TABLE `deviations` ADD `recheckedAt` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `loginId` text;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_loginId_unique` ON `users` (`loginId`);