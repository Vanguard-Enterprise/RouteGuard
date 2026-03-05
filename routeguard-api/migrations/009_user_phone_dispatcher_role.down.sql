DELETE FROM user_roles
WHERE role_id IN (
  SELECT id FROM org_roles WHERE name = 'dispatcher' AND is_system = true
);
DELETE FROM org_roles WHERE name = 'dispatcher' AND is_system = true;
ALTER TABLE users DROP COLUMN phone;
