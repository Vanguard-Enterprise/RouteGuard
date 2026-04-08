ALTER TABLE organizations
    ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN demo_template_version TEXT,
    ADD COLUMN demo_last_reset_at TIMESTAMPTZ;

CREATE TABLE demo_reset_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_version TEXT NOT NULL,
    reset_mode TEXT NOT NULL DEFAULT 'full' CHECK (reset_mode IN ('full', 'refresh')),
    status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    started_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    started_by_email TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX idx_demo_reset_runs_org_started_at
    ON demo_reset_runs (org_id, started_at DESC);
