CREATE TABLE `teacherAnnotations` (
	`id` text PRIMARY KEY NOT NULL,
	`bundleId` text NOT NULL,
	`questionId` text NOT NULL,
	`pageNumber` integer NOT NULL,
	`type` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real DEFAULT 0 NOT NULL,
	`height` real DEFAULT 0 NOT NULL,
	`content` text,
	`style` text,
	`createdByUserId` integer,
	`createdByRole` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
