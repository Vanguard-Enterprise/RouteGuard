ALTER TABLE devices DROP COLUMN IF EXISTS claim_code;
ALTER TABLE devices ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('unprovisioned','provisioned','active','revoked'));
UPDATE devices SET status = 'unprovisioned' WHERE status = 'unclaimed';
UPDATE devices SET status = 'provisioned' WHERE status = 'active';
