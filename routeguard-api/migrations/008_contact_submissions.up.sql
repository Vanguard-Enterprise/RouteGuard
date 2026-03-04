CREATE TABLE contact_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  organization TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new', 'in_progress', 'closed')),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID        NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  author_id      UUID        NOT NULL REFERENCES users(id),
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_notes_submission_id ON contact_notes(submission_id);

UPDATE staff_roles
SET permissions = array_append(permissions, 'contacts:read')
WHERE name = 'super_admin' AND is_system = true;
