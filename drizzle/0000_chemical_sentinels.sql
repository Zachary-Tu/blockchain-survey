CREATE TABLE `experiment_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`participant_code` text DEFAULT '' NOT NULL,
	`expertise` text DEFAULT 'none' NOT NULL,
	`experimental_arm` text DEFAULT 'trajectory' NOT NULL,
	`protocol_version` text NOT NULL,
	`model_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `experiment_sessions` (`status`);--> statement-breakpoint
CREATE TABLE `stage_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`curve_id` text NOT NULL,
	`disclosure_level` integer NOT NULL,
	`disclosure_key` text NOT NULL,
	`boundary_1_index` integer NOT NULL,
	`boundary_2_index` integer NOT NULL,
	`boundary_1_ratio` real NOT NULL,
	`boundary_2_ratio` real NOT NULL,
	`boundary_1_date` text NOT NULL,
	`boundary_2_date` text NOT NULL,
	`confidence` integer NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `experiment_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_decisions_session_id` ON `stage_decisions` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_decisions_session_curve_layer` ON `stage_decisions` (`session_id`,`curve_id`,`disclosure_level`);