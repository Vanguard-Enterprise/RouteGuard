-- 002_super_admin.down.sql

DROP TABLE IF EXISTS software_releases;
DROP TABLE IF EXISTS org_billing;
DROP TABLE IF EXISTS audit_events;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE users DROP COLUMN IF EXISTS disabled_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS suspended_at;
