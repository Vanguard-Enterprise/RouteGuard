-- ============================================================
-- Tenant & Auth
-- ============================================================

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL DEFAULT 'district' CHECK (type IN ('district','company')),
  logo_url   TEXT,
  timezone   TEXT NOT NULL DEFAULT 'America/New_York',
  settings   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org_id ON users(org_id);

CREATE TABLE user_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('password','oidc','saml')),
  provider_user_id TEXT,
  password_hash    TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sso_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('oidc','saml')),
  display_name        TEXT NOT NULL,
  domain              TEXT NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  oidc_issuer_url     TEXT,
  oidc_client_id      TEXT,
  oidc_client_secret  TEXT,
  oidc_scopes         TEXT NOT NULL DEFAULT 'openid email profile',
  saml_entity_id      TEXT,
  saml_sso_url        TEXT,
  saml_certificate    TEXT,
  saml_metadata_url   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sso_connections_org_id ON sso_connections(org_id);
CREATE INDEX idx_sso_connections_domain ON sso_connections(domain);

-- ============================================================
-- RBAC
-- ============================================================

CREATE TABLE org_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);
CREATE INDEX idx_org_roles_org_id ON org_roles(org_id);

CREATE TABLE user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  UNIQUE (user_id, role_id)
);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

CREATE TABLE sso_role_mappings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sso_connection_id UUID NOT NULL REFERENCES sso_connections(id) ON DELETE CASCADE,
  claim_key         TEXT NOT NULL,
  claim_value       TEXT NOT NULL,
  org_role_id       UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE
);
CREATE INDEX idx_sso_role_mappings_connection_id ON sso_role_mappings(sso_connection_id);

-- ============================================================
-- Devices
-- ============================================================

CREATE TABLE devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serial            TEXT NOT NULL UNIQUE,
  device_token_hash TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'unprovisioned'
                      CHECK (status IN ('unprovisioned','provisioned','active','revoked')),
  vehicle_id        UUID,
  seat_count        INTEGER,
  bus_layout        JSONB,
  provisioned_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devices_org_id ON devices(org_id);
CREATE INDEX idx_devices_status ON devices(status);

-- ============================================================
-- Core Entities
-- ============================================================

CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  phone         TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_schools_org_id ON schools(org_id);

CREATE TABLE students (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id),
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  student_number TEXT,
  grade          TEXT,
  rfid_tag_id    TEXT,
  address        TEXT,
  city           TEXT,
  state          TEXT,
  zip            TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','inactive','graduated')),
  medical_notes  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_students_org_id ON students(org_id);
CREATE INDEX idx_students_school_id ON students(school_id);
CREATE INDEX idx_students_status ON students(status);

CREATE TABLE guardians (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  phone      TEXT NOT NULL,
  alt_phone  TEXT,
  email      TEXT,
  sms_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  language   TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_guardians_org_id ON guardians(org_id);

CREATE TABLE student_guardians (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id  UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'parent'
                 CHECK (relationship IN ('parent','guardian','emergency')),
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (student_id, guardian_id)
);
CREATE INDEX idx_student_guardians_student_id ON student_guardians(student_id);

-- ============================================================
-- Fleet
-- ============================================================

CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  number        TEXT,
  capacity      INTEGER,
  year          INTEGER,
  make          TEXT,
  model         TEXT,
  vin           TEXT,
  license_plate TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','maintenance','retired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vehicles_org_id ON vehicles(org_id);

ALTER TABLE devices ADD CONSTRAINT devices_vehicle_id_fk
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE TABLE drivers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  phone              TEXT,
  license_number     TEXT,
  license_expiry     DATE,
  pin_hash           TEXT,
  rfid_badge_id      TEXT,
  rfid_badge_id_hash TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','inactive')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_drivers_org_id ON drivers(org_id);
CREATE INDEX idx_drivers_rfid_badge_id_hash ON drivers(rfid_badge_id_hash);

-- ============================================================
-- Routes & Stops
-- ============================================================

CREATE TABLE routes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  type                   TEXT NOT NULL DEFAULT 'morning'
                           CHECK (type IN ('morning','afternoon','field_trip','activity')),
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','active','archived')),
  description            TEXT,
  estimated_duration_min INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_routes_org_id ON routes(org_id);

CREATE TABLE stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  address        TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  sequence_order INTEGER NOT NULL,
  scheduled_time TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_stops_route_id ON stops(route_id);

CREATE TABLE student_stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stop_id        UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  route_id       UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  effective_date DATE,
  end_date       DATE
);
CREATE INDEX idx_student_stops_route_id ON student_stops(route_id);
CREATE INDEX idx_student_stops_stop_id ON student_stops(stop_id);

CREATE TABLE route_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES routes(id),
  vehicle_id     UUID NOT NULL REFERENCES vehicles(id),
  driver_id      UUID NOT NULL REFERENCES drivers(id),
  effective_date DATE,
  end_date       DATE,
  days_of_week   TEXT NOT NULL DEFAULT 'MTWRF',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_route_assignments_route_id ON route_assignments(route_id);
CREATE INDEX idx_route_assignments_driver_id ON route_assignments(driver_id);

-- ============================================================
-- Live Operations
-- ============================================================

CREATE TABLE trips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_assignment_id UUID NOT NULL REFERENCES route_assignments(id),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  date                DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trips_org_id ON trips(org_id);
CREATE INDEX idx_trips_date ON trips(date);
CREATE INDEX idx_trips_status ON trips(status);

CREATE TABLE trip_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  speed       DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_locations_trip_id ON trip_locations(trip_id);
CREATE INDEX idx_trip_locations_recorded_at ON trip_locations(recorded_at DESC);

CREATE TABLE scan_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id),
  student_id  UUID REFERENCES students(id),
  stop_id     UUID REFERENCES stops(id),
  rfid_tag_id TEXT NOT NULL,
  scan_type   TEXT NOT NULL CHECK (scan_type IN ('board','exit')),
  authorized  BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scan_events_trip_id ON scan_events(trip_id);
CREATE INDEX idx_scan_events_student_id ON scan_events(student_id);

CREATE TABLE sms_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id  UUID NOT NULL REFERENCES guardians(id),
  trip_id      UUID REFERENCES trips(id),
  student_id   UUID REFERENCES students(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('eta','board','exit','alert')),
  message_body TEXT NOT NULL,
  twilio_sid   TEXT,
  status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','sent','delivered','failed')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sms_messages_guardian_id ON sms_messages(guardian_id);
CREATE INDEX idx_sms_messages_trip_id ON sms_messages(trip_id);

-- ============================================================
-- Reporting
-- ============================================================

CREATE TABLE daily_summaries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  route_id       UUID NOT NULL REFERENCES routes(id),
  date           DATE NOT NULL,
  total_students INTEGER NOT NULL DEFAULT 0,
  boarded_count  INTEGER NOT NULL DEFAULT 0,
  on_time        BOOLEAN NOT NULL DEFAULT TRUE,
  delay_minutes  INTEGER DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, route_id, date)
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('user','device','system')),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_metadata_org ON audit_logs((metadata->>'org_id'));
