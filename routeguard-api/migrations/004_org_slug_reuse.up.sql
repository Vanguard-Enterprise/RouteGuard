ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_slug_key;
DROP INDEX IF EXISTS idx_organizations_slug;

CREATE UNIQUE INDEX idx_organizations_active_slug
	ON organizations (slug)
	WHERE deleted_at IS NULL;
