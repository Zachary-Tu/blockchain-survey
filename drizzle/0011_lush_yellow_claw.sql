CREATE TABLE `experiment_step_exposures` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`step_order` integer NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `experiment_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_step_exposures_session_step` ON `experiment_step_exposures` (`session_id`,`step_order`);--> statement-breakpoint
ALTER TABLE `agent_run_attempts` ADD `model_api_attempt_number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_run_attempts` ADD `mechanical_action_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_run_attempts` ADD `mechanical_retry_number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_run_attempts` ADD `source_model_request_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_run_attempts` ADD `runtime_request_sha256` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_mechanical_retry` ON `agent_run_attempts` (`session_id`,`step_order`,`mechanical_action_id`,`mechanical_retry_number`) WHERE "agent_run_attempts"."mechanical_action_id" <> '' AND "agent_run_attempts"."mechanical_retry_number" > 0;--> statement-breakpoint
ALTER TABLE `experiment_sessions` ADD `termination_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `m1_pair_assignments` ADD `agent_profile_sha256` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `m1_pair_assignments` ADD `primary_browser_major` integer DEFAULT 0 NOT NULL;