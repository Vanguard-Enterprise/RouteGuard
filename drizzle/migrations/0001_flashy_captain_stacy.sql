CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`code_verifier` text,
	`connection_id` text,
	`flow_type` text NOT NULL,
	`redirect_after` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_states_state_unique` ON `oauth_states` (`state`);--> statement-breakpoint
CREATE TABLE `sso_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`type` text DEFAULT 'oidc' NOT NULL,
	`display_name` text NOT NULL,
	`domain` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`oidc_issuer_url` text,
	`oidc_client_id` text,
	`oidc_client_secret` text,
	`oidc_scopes` text DEFAULT 'openid email profile',
	`saml_entity_id` text,
	`saml_sso_url` text,
	`saml_certificate` text,
	`saml_metadata_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sso_connections_domain_unique` ON `sso_connections` (`domain`);--> statement-breakpoint
ALTER TABLE `users` ADD `auth_provider` text DEFAULT 'sso';