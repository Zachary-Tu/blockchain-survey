ALTER TABLE `modular_responses` ADD `response_version` text DEFAULT 'pre-v4' NOT NULL;--> statement-breakpoint
ALTER TABLE `modular_responses` ADD `stimulus_window_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `modular_responses` ADD `cue_schema_version` text DEFAULT 'legacy-cues-v1' NOT NULL;