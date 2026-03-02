-- Make device_token_hash nullable for unprovisioned devices
ALTER TABLE devices ALTER COLUMN device_token_hash DROP NOT NULL;
