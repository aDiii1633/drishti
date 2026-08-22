ALTER TABLE `users` ADD `isDemo` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bundles` ADD `studentId` text;--> statement-breakpoint
ALTER TABLE `bundles` ADD `isDemo` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `markingSchemes` ADD `isDemo` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `examSessions` ADD `isDemo` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `examPapers` ADD `isDemo` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer,
	`candidateId` text NOT NULL,
	`name` text NOT NULL,
	`dateOfBirth` text NOT NULL,
	`schoolId` text NOT NULL,
	`examSessionId` text NOT NULL,
	`isDemo` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_userId_unique` ON `students` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_candidateId_unique` ON `students` (`candidateId`);
