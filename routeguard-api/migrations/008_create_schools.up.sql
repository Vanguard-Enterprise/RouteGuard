CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL DEFAULT ('SCH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    contact_phone TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_schools_org_school_id_active
    ON schools (org_id, school_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_schools_org_id ON schools(org_id);
CREATE INDEX idx_schools_org_active ON schools(org_id, is_active);
CREATE INDEX idx_schools_org_name_search ON schools(org_id, lower(name), lower(school_id));
