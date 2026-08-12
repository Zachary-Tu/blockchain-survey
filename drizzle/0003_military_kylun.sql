ALTER TABLE `research_responses` ADD `task_family` text DEFAULT 'placement' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_responses` ADD `previous_boundaries_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_responses` ADD `boundary_intervals_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_responses` ADD `first_uncertainty_ms` integer;--> statement-breakpoint
ALTER TABLE `research_responses` ADD `uncertainty_adjustment_count` integer DEFAULT 0 NOT NULL;