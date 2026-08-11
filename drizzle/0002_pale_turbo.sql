CREATE TABLE `research_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`stimulus_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`asset_order` integer NOT NULL,
	`metric_type` text NOT NULL,
	`task_mode` text NOT NULL,
	`resolution` text NOT NULL,
	`scale_mode` text DEFAULT 'linear' NOT NULL,
	`disclosure_level` integer NOT NULL,
	`disclosure_key` text NOT NULL,
	`boundary_count` integer DEFAULT 0 NOT NULL,
	`boundaries_json` text DEFAULT '[]' NOT NULL,
	`reference_boundaries_json` text DEFAULT '[]' NOT NULL,
	`reasonableness_rating` integer,
	`confidence` integer NOT NULL,
	`influence_rating` integer,
	`confidence_touched` integer DEFAULT false NOT NULL,
	`influence_touched` integer DEFAULT false NOT NULL,
	`no_change_confirmed` integer DEFAULT false NOT NULL,
	`cue_tags` text DEFAULT '[]' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`reveal_read_ms` integer DEFAULT 0 NOT NULL,
	`first_move_ms` integer,
	`adjustment_count` integer DEFAULT 0 NOT NULL,
	`scale_switch_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `experiment_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_responses_session_id` ON `research_responses` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_research_responses_condition` ON `research_responses` (`metric_type`,`task_mode`,`resolution`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_response_session_stimulus_layer` ON `research_responses` (`session_id`,`stimulus_id`,`disclosure_level`);--> statement-breakpoint
ALTER TABLE `experiment_sessions` ADD `study_config_json` text DEFAULT '{}' NOT NULL;