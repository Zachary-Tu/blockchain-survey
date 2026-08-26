CREATE TABLE IF NOT EXISTS `agent_run_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`step_order` integer NOT NULL,
	`attempt_number` integer NOT NULL,
	`controller_version` text DEFAULT '' NOT NULL,
	`model_request_id` text DEFAULT '' NOT NULL,
	`prompt_sha256` text DEFAULT '' NOT NULL,
	`screenshot_sha256` text DEFAULT '' NOT NULL,
	`output_sha256` text DEFAULT '' NOT NULL,
	`context_policy` text DEFAULT 'persistent' NOT NULL,
	`input_modality` text DEFAULT 'screenshot' NOT NULL,
	`image_detail` text DEFAULT 'auto' NOT NULL,
	`temperature` real,
	`top_p` real,
	`seed` integer,
	`reasoning_effort` text DEFAULT '' NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`response_id` integer,
	`response_sha256` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `experiment_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`response_id`) REFERENCES `modular_responses`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_attempts_session_step` ON `agent_run_attempts` (`session_id`,`step_order`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_agent_attempts_session_step_attempt` ON `agent_run_attempts` (`session_id`,`step_order`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_agent_one_submitted_per_step` ON `agent_run_attempts` (`session_id`,`step_order`) WHERE `status` = 'submitted';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_agent_attempt_response` ON `agent_run_attempts` (`response_id`) WHERE `response_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_agent_model_request` ON `agent_run_attempts` (`session_id`,`model_request_id`) WHERE `model_request_id` <> '';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `experiment_expected_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`step_order` integer NOT NULL,
	`trial_id` text NOT NULL,
	`trial_order` integer NOT NULL,
	`module_key` text NOT NULL,
	`task_type` text NOT NULL,
	`stimulus_type` text DEFAULT 'crypto' NOT NULL,
	`asset_id` text NOT NULL,
	`metric_type` text NOT NULL,
	`resolution` text NOT NULL,
	`scale_mode` text NOT NULL,
	`window_mode` text NOT NULL,
	`disclosure_index` integer NOT NULL,
	`disclosure_key` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `experiment_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_expected_steps_session_step` ON `experiment_expected_steps` (`session_id`,`step_order`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_expected_steps_session_trial_disclosure` ON `experiment_expected_steps` (`session_id`,`trial_id`,`disclosure_index`);
