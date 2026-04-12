DROP INDEX IF EXISTS idx_drivers_org_pin_lookup_active;

ALTER TABLE drivers
    DROP COLUMN IF EXISTS pin_updated_at,
    DROP COLUMN IF EXISTS pin_lookup_hash,
    DROP COLUMN IF EXISTS pin_hash;
