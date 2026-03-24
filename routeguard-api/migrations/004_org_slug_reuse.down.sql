DROP INDEX IF EXISTS idx_organizations_active_slug;

ALTER TABLE organizations
	ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

CREATE UNIQUE INDEX idx_organizations_slug ON organizations (slug);
