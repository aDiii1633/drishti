ALTER TABLE `users` ADD `phoneNumber` text;--> statement-breakpoint
ALTER TABLE `users` ADD `supabaseUserId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_phoneNumber_unique` ON `users` (`phoneNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_supabaseUserId_unique` ON `users` (`supabaseUserId`);
