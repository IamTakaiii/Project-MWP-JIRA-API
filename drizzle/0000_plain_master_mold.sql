CREATE TABLE `sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`jira_url` text NOT NULL,
	`email` text NOT NULL,
	`api_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_accessed` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_last_accessed` ON `sessions` (`last_accessed`);