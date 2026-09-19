CREATE TABLE `provisioned_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_name` text NOT NULL,
	`resource_id` text NOT NULL,
	`binding_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provisioned_resources_user_type_idx` ON `provisioned_resources` (`user_id`,`resource_type`);--> statement-breakpoint
CREATE INDEX `provisioned_resources_app_idx` ON `provisioned_resources` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `provisioned_resources_app_binding_idx` ON `provisioned_resources` (`app_id`,`binding_name`);