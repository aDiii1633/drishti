ALTER TABLE `evaluations` ADD `aiOutput` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `aiProvider` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `aiModel` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `aiEvaluatedAt` integer;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `promptVersion` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `rubricVersion` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `evaluationVersion` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `requiresHumanReview` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `humanDecision` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `decisionReason` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `teacherComment` text;--> statement-breakpoint
CREATE TABLE `answerExtractions` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`questionId` text NOT NULL,
	`pageNumber` integer,
	`rawText` text NOT NULL,
	`structuredText` text NOT NULL,
	`language` text NOT NULL,
	`confidence` integer NOT NULL,
	`answerRegion` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text NOT NULL,
	`externalJobId` text,
	`error` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
