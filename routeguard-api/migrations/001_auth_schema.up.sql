CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Global users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_enc TEXT NOT NULL,
    email_hash TEXT NOT NULL UNIQUE,
    name_enc TEXT NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email_hash ON users (email_hash);

-- Organizations (tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_enc TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_platform BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_organizations_slug ON organizations (slug);

-- Org memberships (many-to-many)
CREATE TABLE org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);

CREATE INDEX idx_org_memberships_user_id ON org_memberships (user_id);
CREATE INDEX idx_org_memberships_org_id ON org_memberships (org_id);

-- Org roles (RBAC)
CREATE TABLE org_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_roles_org_id ON org_roles (org_id);

-- Member role assignments
CREATE TABLE org_member_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL REFERENCES org_memberships (id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES org_roles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (membership_id, role_id)
);

-- SSO connections per org
CREATE TABLE sso_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('oidc', 'saml')),
    display_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    oidc_issuer_url TEXT,
    oidc_client_id TEXT,
    oidc_client_secret_enc TEXT,
    oidc_scopes TEXT,
    saml_entity_id TEXT,
    saml_sso_url TEXT,
    saml_certificate_enc TEXT,
    saml_metadata_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sso_connections_org_id ON sso_connections (org_id);

-- User identities (password, oidc, saml)
CREATE TABLE user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_identities_user_id ON user_identities (user_id);
CREATE INDEX idx_user_identities_provider_user_id ON user_identities (provider_user_id);

-- Seed the platform organization
INSERT INTO organizations (id, name_enc, slug, is_platform)
VALUES ('00000000-0000-0000-0000-000000000001', 'RouteGuard', 'routeguard', true);

-- Seed platform Owner role
INSERT INTO org_roles (id, org_id, name, permissions, is_system)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Owner',
    ARRAY['platform:manage', 'org:manage', 'members:read', 'members:write', 'roles:read', 'roles:write', 'sso:read', 'sso:write'],
    true
);
