CREATE TABLE `auditEvents` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`actorRole` text NOT NULL,
	`eventType` text NOT NULL,
	`detail` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`candidateName` text NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'intake' NOT NULL,
	`questionPaperKey` text,
	`questionPaperUrl` text,
	`bookletKey` text,
	`bookletUrl` text,
	`finalKey` text,
	`finalUrl` text,
	`pageCount` integer DEFAULT 0 NOT NULL,
	`printedMaximumMarks` integer,
	`operatorConfirmedTotal` integer,
	`catalogTotal` integer DEFAULT 80 NOT NULL,
	`coverageComplete` integer DEFAULT false NOT NULL,
	`schemeId` text,
	`qrToken` text,
	`createdByRole` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clarityCalibrationSamples` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceLabel` text NOT NULL,
	`expectedClarity` text NOT NULL,
	`observedClarity` text NOT NULL,
	`laplacianVariance` integer NOT NULL,
	`reviewerNote` text,
	`createdByRole` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deviations` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`evaluationId` text NOT NULL,
	`delta` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolutionNote` text,
	`resolvedByRole` text,
	`createdAt` integer NOT NULL,
	`resolvedAt` integer
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`artifactType` text NOT NULL,
	`fileName` text NOT NULL,
	`mimeType` text NOT NULL,
	`storageKey` text NOT NULL,
	`storageUrl` text NOT NULL,
	`pageNumber` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`questionId` text NOT NULL,
	`questionLabel` text NOT NULL,
	`schemeMaximum` integer NOT NULL,
	`humanMarks` integer,
	`aiMarks` integer,
	`feedback` text,
	`confidence` integer,
	`pagesViewed` text,
	`reviewedByRole` text,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`output` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `markingSchemes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`maximumMarks` integer NOT NULL,
	`questions` text NOT NULL,
	`createdByRole` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pageChecks` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`pageNumber` integer NOT NULL,
	`clarity` text NOT NULL,
	`laplacianVariance` integer NOT NULL,
	`reason` text NOT NULL,
	`pageDataUrl` text,
	`checkedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);