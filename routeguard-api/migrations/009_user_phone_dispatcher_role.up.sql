ALTER TABLE users ADD COLUMN phone TEXT;

-- Backfill dispatcher system role for all existing orgs.
INSERT INTO org_roles (id, org_id, name, permissions, is_system)
SELECT
  gen_random_uuid(),
  o.id,
  'dispatcher',
  ARRAY['trips:read', 'routes:read']::TEXT[],
  true
FROM organizations o
ON CONFLICT (org_id, name) DO NOTHING;
