ALTER TABLE `stage_decisions` ADD `influence_rating` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_decisions` ADD `cue_tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_decisions` ADD `reveal_read_ms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_decisions` ADD `first_move_ms` integer;--> statement-breakpoint
ALTER TABLE `stage_decisions` ADD `adjustment_count` integer DEFAULT 0 NOT NULL;