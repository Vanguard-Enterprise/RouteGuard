ALTER TABLE software_releases
    ADD COLUMN artifact_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN artifact_sha256 TEXT NOT NULL DEFAULT '',
    ADD COLUMN installer_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN target_os TEXT NOT NULL DEFAULT 'debian',
    ADD COLUMN target_arch TEXT NOT NULL DEFAULT 'amd64',
    ADD COLUMN is_install_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX idx_software_releases_install_default
    ON software_releases(is_install_default)
    WHERE is_install_default = TRUE;
