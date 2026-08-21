CREATE TABLE `go_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`level` integer NOT NULL,
	`mode` text DEFAULT 'quiz' NOT NULL,
	`score` integer NOT NULL,
	`total` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`answers_json` text DEFAULT '[]' NOT NULL,
	`certificate_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `go_learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_go_attempts_learner` ON `go_attempts` (`learner_id`);--> statement-breakpoint
CREATE INDEX `idx_go_attempts_level` ON `go_attempts` (`level`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_go_attempts_certificate` ON `go_attempts` (`certificate_id`);--> statement-breakpoint
CREATE TABLE `go_games` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`opponent_id` text NOT NULL,
	`board_size` integer NOT NULL,
	`result` text NOT NULL,
	`score_json` text DEFAULT '{}' NOT NULL,
	`move_count` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `go_learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_go_games_learner` ON `go_games` (`learner_id`);--> statement-breakpoint
CREATE INDEX `idx_go_games_opponent` ON `go_games` (`opponent_id`);--> statement-breakpoint
CREATE TABLE `go_learners` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`access_code_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_go_learners_last_seen` ON `go_learners` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `go_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` text NOT NULL,
	`level` integer NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`stars` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`last_attempt_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `go_learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_go_progress_learner_level` ON `go_progress` (`learner_id`,`level`);--> statement-breakpoint
CREATE INDEX `idx_go_progress_level` ON `go_progress` (`level`);