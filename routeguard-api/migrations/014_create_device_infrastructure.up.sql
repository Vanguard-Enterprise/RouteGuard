CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    device_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    software_version TEXT NOT NULL DEFAULT '',
    connectivity_state TEXT NOT NULL DEFAULT 'unknown',
    app_health TEXT NOT NULL DEFAULT 'unknown',
    last_seen_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_devices_org_id ON devices(org_id);
CREATE INDEX idx_devices_vehicle_id ON devices(vehicle_id);
CREATE INDEX idx_devices_last_seen_at ON devices(last_seen_at DESC);
CREATE INDEX idx_devices_org_active ON devices(org_id, deleted_at, last_seen_at DESC);

CREATE TABLE software_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,
    release_date DATE NOT NULL,
    release_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rider_scan_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
    event_uid TEXT NOT NULL,
    student_tag TEXT NOT NULL,
    scanned_at TIMESTAMPTZ NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'accepted',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, event_uid)
);

CREATE INDEX idx_rider_scan_events_device_scanned_at ON rider_scan_events(device_id, scanned_at DESC);
CREATE INDEX idx_rider_scan_events_org_scanned_at ON rider_scan_events(org_id, scanned_at DESC);
