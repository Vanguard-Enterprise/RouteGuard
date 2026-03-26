CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    grade TEXT NOT NULL,
    school TEXT NOT NULL,
    guardian_name TEXT NOT NULL DEFAULT '',
    guardian_contact TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_students_org_student_id_active
    ON students (org_id, student_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_students_org_id ON students(org_id);
CREATE INDEX idx_students_org_active ON students(org_id, is_active);
CREATE INDEX idx_students_org_name_search ON students(org_id, lower(last_name), lower(first_name));
