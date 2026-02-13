CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`permissions` text DEFAULT '{}',
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `daily_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`route_id` text NOT NULL,
	`date` text NOT NULL,
	`total_students` integer DEFAULT 0 NOT NULL,
	`boarded_count` integer DEFAULT 0 NOT NULL,
	`on_time` integer DEFAULT true NOT NULL,
	`delay_minutes` integer DEFAULT 0,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone` text,
	`license_number` text,
	`license_expiry` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `guardians` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone` text NOT NULL,
	`alt_phone` text,
	`email` text,
	`sms_opt_in` integer DEFAULT true NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text DEFAULT 'district' NOT NULL,
	`sso_provider` text,
	`sso_domain` text,
	`sso_connection_id` text,
	`logo_url` text,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`settings` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `route_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`effective_date` text,
	`end_date` text,
	`days_of_week` text DEFAULT 'MTWRF',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'morning' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`description` text,
	`estimated_duration_min` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`student_id` text,
	`stop_id` text,
	`rfid_tag_id` text NOT NULL,
	`scan_type` text NOT NULL,
	`authorized` integer DEFAULT true NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`lat` real,
	`lng` real,
	`phone` text,
	`contact_name` text,
	`contact_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `sms_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`guardian_id` text NOT NULL,
	`trip_id` text,
	`student_id` text,
	`message_type` text NOT NULL,
	`message_body` text NOT NULL,
	`twilio_sid` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stops` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`sequence_order` integer NOT NULL,
	`scheduled_time` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `student_guardians` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`guardian_id` text NOT NULL,
	`relationship` text DEFAULT 'parent' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `student_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`stop_id` text NOT NULL,
	`route_id` text NOT NULL,
	`effective_date` text,
	`end_date` text,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`school_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`student_number` text,
	`grade` text,
	`rfid_tag_id` text,
	`address` text,
	`city` text,
	`state` text,
	`zip` text,
	`lat` real,
	`lng` real,
	`status` text DEFAULT 'active' NOT NULL,
	`medical_notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`speed` real,
	`heading` real,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`route_assignment_id` text NOT NULL,
	`org_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`route_assignment_id`) REFERENCES `route_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`sso_id` text,
	`avatar_url` text,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_org_email_idx` ON `users` (`org_id`,`email`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`number` text,
	`capacity` integer,
	`year` integer,
	`make` text,
	`model` text,
	`vin` text,
	`license_plate` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
