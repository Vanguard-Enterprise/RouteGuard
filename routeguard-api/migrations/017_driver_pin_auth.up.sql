ALTER TABLE drivers
    ADD COLUMN pin_hash TEXT,
    ADD COLUMN pin_lookup_hash TEXT,
    ADD COLUMN pin_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_drivers_org_pin_lookup_active
    ON drivers (org_id, pin_lookup_hash)
    WHERE deleted_at IS NULL AND pin_lookup_hash IS NOT NULL;
