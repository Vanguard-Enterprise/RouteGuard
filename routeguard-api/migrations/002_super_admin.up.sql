-- 002_super_admin.up.sql

-- Organizations: suspend + soft delete
ALTER TABLE organizations ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN deleted_at TIMESTAMPTZ;

-- Users: disable + last login tracking
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

-- Audit events (append-only)
CREATE TABLE audit_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL REFERENCES users(id),
    actor_email TEXT NOT NULL,
    org_id      UUID REFERENCES organizations(id),
    event_type  TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   UUID,
    metadata    JSONB DEFAULT '{}',
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX idx_audit_events_target_id ON audit_events(target_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);

-- Billing (per-org contract tracking)
CREATE TABLE org_billing (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID NOT NULL UNIQUE REFERENCES organizations(id),
    billing_status        TEXT NOT NULL DEFAULT 'pilot'
                          CHECK (billing_status IN ('pilot', 'active', 'cancelled')),
    pilot_ends_at         TIMESTAMPTZ,
    contract_notes        TEXT DEFAULT '',
    billing_contact_email TEXT DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Software releases (for future update tracking)
CREATE TABLE software_releases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version       TEXT NOT NULL UNIQUE,
    release_date  DATE NOT NULL,
    release_notes TEXT DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
