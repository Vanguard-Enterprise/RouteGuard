DROP INDEX IF EXISTS idx_software_releases_install_default;

ALTER TABLE software_releases
    DROP COLUMN IF EXISTS is_install_default,
    DROP COLUMN IF EXISTS target_arch,
    DROP COLUMN IF EXISTS target_os,
    DROP COLUMN IF EXISTS installer_url,
    DROP COLUMN IF EXISTS artifact_sha256,
    DROP COLUMN IF EXISTS artifact_url;
