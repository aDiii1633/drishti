CREATE TABLE `examPapers` (
	`id` text PRIMARY KEY NOT NULL,
	`examSessionId` text NOT NULL,
	`subject` text NOT NULL,
	`subjectCode` text NOT NULL,
	`paperCode` text NOT NULL,
	`title` text NOT NULL,
	`maximumMarks` integer NOT NULL,
	`schemeId` text,
	`qrToken` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`createdByUserId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `examPapers_qrToken_unique` ON `examPapers` (`qrToken`);--> statement-breakpoint
CREATE TABLE `examSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`centerName` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`recheckOpenUntil` integer,
	`createdByUserId` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `examSessions_code_unique` ON `examSessions` (`code`);--> statement-breakpoint
CREATE TABLE `recheckRequests` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`studentReference` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`assignedToUserId` integer,
	`resolutionNote` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bundles` ADD `examPaperId` text;--> statement-breakpoint
ALTER TABLE `bundles` ADD `intakeQrToken` text;