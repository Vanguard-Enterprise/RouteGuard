DROP TABLE IF EXISTS demo_reset_runs;

ALTER TABLE organizations
    DROP COLUMN IF EXISTS demo_last_reset_at,
    DROP COLUMN IF EXISTS demo_template_version,
    DROP COLUMN IF EXISTS is_demo;
