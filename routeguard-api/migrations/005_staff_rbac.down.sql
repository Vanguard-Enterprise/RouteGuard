-- routeguard-api/migrations/005_staff_rbac.down.sql
DROP TABLE IF EXISTS staff_user_roles;
DROP TABLE IF EXISTS staff_roles;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
