-- Seed system roles for all organizations that are missing them.
-- Uses ON CONFLICT DO NOTHING so it is safe to run multiple times.
-- Permissions match SeedSystemRoles() in internal/repository/org_repo.go.

INSERT INTO org_roles (id, org_id, name, permissions, is_system)
SELECT
  gen_random_uuid(),
  o.id,
  r.name,
  r.permissions,
  true
FROM organizations o
CROSS JOIN (VALUES
  (
    'org_admin',
    ARRAY[
      'org:manage','users:read','users:write',
      'schools:read','schools:write',
      'students:read','students:write',
      'drivers:read','drivers:write',
      'vehicles:read','vehicles:write',
      'routes:read','routes:write',
      'trips:read','reports:read',
      'devices:read','devices:write'
    ]::TEXT[]
  ),
  (
    'school_admin',
    ARRAY[
      'schools:read',
      'students:read','students:write',
      'guardians:read','guardians:write',
      'routes:read','trips:read'
    ]::TEXT[]
  ),
  (
    'driver',
    ARRAY['trips:read']::TEXT[]
  )
) AS r(name, permissions)
ON CONFLICT (org_id, name) DO NOTHING;
