-- Make org_id nullable (unclaimed devices have no org yet)
ALTER TABLE devices ALTER COLUMN org_id DROP NOT NULL;

-- Add claim_code column (8-char uppercase alphanumeric, cleared after claim)
ALTER TABLE devices ADD COLUMN claim_code TEXT UNIQUE;

-- Replace status constraint: unclaimed replaces unprovisioned, active replaces provisioned
ALTER TABLE devices DROP CONSTRAINT devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('unclaimed', 'active', 'revoked'));

-- Migrate any existing rows to the new status values
UPDATE devices SET status = 'unclaimed' WHERE status = 'unprovisioned';
UPDATE devices SET status = 'active' WHERE status = 'provisioned';

-- Drop device_token_hash NOT NULL constraint (already done in migration 002, verify no-op)
