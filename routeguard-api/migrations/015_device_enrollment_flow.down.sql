DROP INDEX IF EXISTS idx_devices_token_hash;
DROP INDEX IF EXISTS idx_devices_enrollment_code_hash;

ALTER TABLE devices
    DROP COLUMN IF EXISTS revoked_at,
    DROP COLUMN IF EXISTS token_issued_at,
    DROP COLUMN IF EXISTS pending_device_token_enc,
    DROP COLUMN IF EXISTS device_token_hash,
    DROP COLUMN IF EXISTS enrolled_at,
    DROP COLUMN IF EXISTS enrollment_expires_at,
    DROP COLUMN IF EXISTS enrollment_code_hash;

ALTER TABLE devices ALTER COLUMN org_id SET NOT NULL;
