-- routeguard-api/migrations/005_staff_rbac.up.sql

-- Soft delete support (staff only, but on shared users table)
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- Staff roles: parallel to org_roles but not org-scoped
CREATE TABLE staff_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOL NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protected super_admin role seeded here
INSERT INTO staff_roles (name, permissions, is_system) VALUES (
  'super_admin',
  ARRAY['orgs:read','orgs:write','devices:read','devices:write','audit:read','staff:manage'],
  true
);

-- Staff user <-> role join table
CREATE TABLE staff_user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES staff_roles(id) ON DELETE CASCADE,
  UNIQUE (user_id, role_id)
);

CREATE INDEX idx_staff_user_roles_user_id ON staff_user_roles(user_id);
