CREATE TABLE IF NOT EXISTS `m1_pair_assignments` (
	`pair_id` text PRIMARY KEY NOT NULL,
	`protocol_architecture` text NOT NULL,
	`schedule_id` integer NOT NULL,
	`information_condition` text NOT NULL,
	`stimulus_sha256` text NOT NULL,
	`event_source_sha256` text NOT NULL,
	`assignment_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_m1_pair_assignment_condition_schedule` ON `m1_pair_assignments` (`information_condition`,`schedule_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `m1_launch_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`pair_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`participant_code` text NOT NULL,
	`replicate_id` text NOT NULL,
	`schedule_id` integer NOT NULL,
	`information_condition` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`claimed_session_id` text,
	`claimed_at` text,
	FOREIGN KEY (`pair_id`) REFERENCES `m1_pair_assignments`(`pair_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_m1_launch_token_pair_actor` ON `m1_launch_tokens` (`pair_id`,`actor_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `m1_pair_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`pair_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`replicate_id` text NOT NULL,
	`launch_token_hash` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pair_id`) REFERENCES `m1_pair_assignments`(`pair_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`launch_token_hash`) REFERENCES `m1_launch_tokens`(`token_hash`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`session_id`) REFERENCES `experiment_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_m1_pair_slot_actor_replicate` ON `m1_pair_slots` (`pair_id`,`actor_type`,`replicate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_m1_pair_slot_session` ON `m1_pair_slots` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_m1_pair_slot_launch_token` ON `m1_pair_slots` (`launch_token_hash`);

-- `practice_completed_at` is intentionally owned by ensureExperimentSchema's
-- additive runtime migration. This keeps existing Sites/D1 databases safe when
-- the runtime bootstrap has already added the column before this journal is run.
