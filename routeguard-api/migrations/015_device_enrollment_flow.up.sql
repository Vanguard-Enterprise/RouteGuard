ALTER TABLE devices ALTER COLUMN org_id DROP NOT NULL;

ALTER TABLE devices
    ADD COLUMN enrollment_code_hash TEXT,
    ADD COLUMN enrollment_expires_at TIMESTAMPTZ,
    ADD COLUMN enrolled_at TIMESTAMPTZ,
    ADD COLUMN device_token_hash TEXT,
    ADD COLUMN pending_device_token_enc TEXT,
    ADD COLUMN token_issued_at TIMESTAMPTZ,
    ADD COLUMN revoked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_devices_enrollment_code_hash
    ON devices(enrollment_code_hash)
    WHERE enrollment_code_hash IS NOT NULL;

CREATE UNIQUE INDEX idx_devices_token_hash
    ON devices(device_token_hash)
    WHERE device_token_hash IS NOT NULL;

UPDATE devices
SET enrolled_at = COALESCE(last_seen_at, created_at)
WHERE org_id IS NOT NULL AND enrolled_at IS NULL;
