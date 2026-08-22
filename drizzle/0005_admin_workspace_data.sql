ALTER TABLE `bundles` ADD `candidateId` text;--> statement-breakpoint
ALTER TABLE `bundles` ADD `schoolId` text;--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`centerName` text NOT NULL,
	`location` text,
	`status` text DEFAULT 'active' NOT NULL,
	`isDemo` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_code_unique` ON `schools` (`code`);--> statement-breakpoint
CREATE TABLE `evaluatorProfiles` (
	`userId` integer PRIMARY KEY NOT NULL,
	`subject` text,
	`centerName` text,
	`isDemo` integer DEFAULT false NOT NULL,
	`updatedAt` integer NOT NULL
);
