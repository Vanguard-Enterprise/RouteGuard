ALTER TABLE schools
    ALTER COLUMN school_id SET DEFAULT ('SCH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));

ALTER TABLE schools
    DROP COLUMN IF EXISTS contact_name;
