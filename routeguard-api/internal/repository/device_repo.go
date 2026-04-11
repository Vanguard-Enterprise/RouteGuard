package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

const enrollmentTTL = 10 * time.Minute

type DeviceRepo struct {
	pool *pgxpool.Pool
}

func NewDeviceRepo(pool *pgxpool.Pool) *DeviceRepo {
	return &DeviceRepo{pool: pool}
}

type DeviceCheckInInput struct {
	DeviceID          string
	Name              string
	SoftwareVersion   string
	ConnectivityState string
	AppHealth         string
	LastSeenAt        time.Time
	Metadata          json.RawMessage
}

type RiderScanInput struct {
	DeviceID   string
	OrgID      string
	RouteID    *string
	EventUID   string
	StudentTag string
	ScannedAt  time.Time
	Metadata   json.RawMessage
}

type DeviceClaimInput struct {
	OrgID     string
	Code      string
	VehicleID *string
	HMACKey   []byte
	CryptoKey []byte
	ClaimedAt time.Time
}

type SoftwareReleaseCreateInput struct {
	Version          string
	ReleaseDate      string
	ReleaseNotes     string
	ArtifactURL      string
	ArtifactSHA256   string
	InstallerURL     string
	TargetOS         string
	TargetArch       string
	IsInstallDefault bool
}

type EnrollmentStatusResult struct {
	Device     *domain.Device
	Status     string
	Token      string
	Code       *string
	Expires    *time.Time
	WasClaimed bool
}

type deviceScanner interface {
	Scan(dest ...any) error
}

type softwareReleaseScanner interface {
	Scan(dest ...any) error
}

func scanDevice(scanner deviceScanner) (*domain.Device, error) {
	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err := scanner.Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState,
		&d.AppHealth, &enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash,
		&pendingTokenEnc, &d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func scanSoftwareRelease(scanner softwareReleaseScanner) (*domain.SoftwareRelease, error) {
	var rel domain.SoftwareRelease
	err := scanner.Scan(
		&rel.ID,
		&rel.Version,
		&rel.ReleaseDate,
		&rel.ReleaseNotes,
		&rel.ArtifactURL,
		&rel.ArtifactSHA256,
		&rel.InstallerURL,
		&rel.TargetOS,
		&rel.TargetArch,
		&rel.IsInstallDefault,
		&rel.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rel, nil
}

func (r *DeviceRepo) findByDeviceKey(ctx context.Context, deviceKey string) (*domain.Device, error) {
	return scanDevice(r.pool.QueryRow(ctx, `
		SELECT id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		       enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		       token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at
		FROM devices
		WHERE device_key = $1 AND deleted_at IS NULL`,
		deviceKey,
	))
}

func (r *DeviceRepo) UpsertBootstrap(ctx context.Context, deviceKey, softwareVersion string, metadata json.RawMessage) (*domain.Device, error) {
	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO devices (device_key, name, software_version, metadata)
		VALUES ($1, $1, $2, $3)
		ON CONFLICT (device_key) DO UPDATE SET
			software_version = CASE WHEN EXCLUDED.software_version <> '' THEN EXCLUDED.software_version ELSE devices.software_version END,
			metadata = EXCLUDED.metadata,
			updated_at = now(),
			deleted_at = NULL
		RETURNING id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		          enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		          token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at`,
		deviceKey, softwareVersion, metadata,
	).Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState,
		&d.AppHealth, &enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash, &pendingTokenEnc,
		&d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert bootstrap device: %w", err)
	}
	return &d, nil
}

func (r *DeviceRepo) EnsureEnrollmentCode(ctx context.Context, deviceID string, hmacKey []byte, now time.Time) (*domain.Device, string, time.Time, error) {
	device, err := r.findByDeviceKey(ctx, deviceID)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("find device by key: %w", err)
	}
	if device.EnrolledAt != nil && device.DeviceKey != "" && device.RevokedAt == nil {
		return device, "", time.Time{}, nil
	}

	rawCode, err := auth.GenerateToken(4)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("generate enrollment code: %w", err)
	}
	code := strings.ToUpper(rawCode)
	expires := now.Add(enrollmentTTL)

	var updated domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err = r.pool.QueryRow(ctx, `
		UPDATE devices
		SET enrollment_code_hash = $2,
		    enrollment_expires_at = $3,
		    updated_at = now()
		WHERE id = $1
		RETURNING id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		          enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		          token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at`,
		device.ID, crypto.HMAC(hmacKey, code), expires,
	).Scan(
		&updated.ID, &updated.OrgID, &updated.VehicleID, &updated.DeviceKey, &updated.Name, &updated.SoftwareVersion,
		&updated.ConnectivityState, &updated.AppHealth, &enrollmentCodeHash, &updated.EnrollmentExpires, &updated.EnrolledAt,
		&deviceTokenHash, &pendingTokenEnc, &updated.TokenIssuedAt, &updated.RevokedAt, &updated.LastSeenAt,
		&updated.Metadata, &updated.CreatedAt, &updated.UpdatedAt, &updated.DeletedAt,
	)
	if err != nil {
		return nil, "", time.Time{}, fmt.Errorf("update enrollment code: %w", err)
	}
	return &updated, code, expires, nil
}

func (r *DeviceRepo) ClaimByEnrollmentCode(ctx context.Context, in DeviceClaimInput) (*domain.Device, error) {
	codeHash := crypto.HMAC(in.HMACKey, strings.ToUpper(strings.TrimSpace(in.Code)))
	token, err := auth.GenerateToken(32)
	if err != nil {
		return nil, fmt.Errorf("generate device token: %w", err)
	}
	tokenEnc, err := crypto.Encrypt(in.CryptoKey, token)
	if err != nil {
		return nil, fmt.Errorf("encrypt device token: %w", err)
	}
	tokenHash := crypto.HMAC(in.HMACKey, token)

	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err = r.pool.QueryRow(ctx, `
		UPDATE devices
		SET org_id = $2,
		    vehicle_id = $3,
		    enrolled_at = $4,
		    device_token_hash = $5,
		    pending_device_token_enc = $6,
		    token_issued_at = $4,
		    enrollment_code_hash = NULL,
		    enrollment_expires_at = NULL,
		    revoked_at = NULL,
		    updated_at = now()
		WHERE enrollment_code_hash = $1
		  AND enrollment_expires_at > $4
		  AND deleted_at IS NULL
		RETURNING id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		          enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		          token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at`,
		codeHash, in.OrgID, in.VehicleID, in.ClaimedAt, tokenHash, tokenEnc,
	).Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState, &d.AppHealth,
		&enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash, &pendingTokenEnc,
		&d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("claim device by enrollment code: %w", err)
	}
	return &d, nil
}

func (r *DeviceRepo) EnrollmentStatus(ctx context.Context, deviceKey, code string, hmacKey, cryptoKey []byte, now time.Time) (*EnrollmentStatusResult, error) {
	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		       enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		       token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at
		FROM devices
		WHERE device_key = $1 AND deleted_at IS NULL`,
		deviceKey,
	).Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState, &d.AppHealth,
		&enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash, &pendingTokenEnc,
		&d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("load device enrollment status: %w", err)
	}

	if d.EnrolledAt == nil || d.RevokedAt != nil {
		if code == "" || enrollmentCodeHash == nil || d.EnrollmentExpires == nil || d.EnrollmentExpires.Before(now) {
			return &EnrollmentStatusResult{Device: &d, Status: "pending"}, nil
		}
		if crypto.HMAC(hmacKey, strings.ToUpper(strings.TrimSpace(code))) != *enrollmentCodeHash {
			return &EnrollmentStatusResult{Device: &d, Status: "pending"}, nil
		}
		return &EnrollmentStatusResult{Device: &d, Status: "pending", Expires: d.EnrollmentExpires}, nil
	}

	result := &EnrollmentStatusResult{Device: &d, Status: "enrolled"}
	if pendingTokenEnc != nil && *pendingTokenEnc != "" {
		token, err := crypto.Decrypt(cryptoKey, *pendingTokenEnc)
		if err != nil {
			return nil, fmt.Errorf("decrypt pending token: %w", err)
		}
		result.Token = token
		result.WasClaimed = true
		_, err = r.pool.Exec(ctx, `UPDATE devices SET pending_device_token_enc = NULL, updated_at = now() WHERE id = $1`, d.ID)
		if err != nil {
			return nil, fmt.Errorf("clear pending token: %w", err)
		}
	}
	return result, nil
}

func (r *DeviceRepo) AuthenticateByToken(ctx context.Context, tokenHash string) (*domain.Device, error) {
	return scanDevice(r.pool.QueryRow(ctx, `
		SELECT id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		       enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		       token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at
		FROM devices
		WHERE device_token_hash = $1
		  AND enrolled_at IS NOT NULL
		  AND revoked_at IS NULL
		  AND deleted_at IS NULL`,
		tokenHash,
	))
}

func (r *DeviceRepo) UpdateHeartbeat(ctx context.Context, in DeviceCheckInInput) (*domain.Device, error) {
	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err := r.pool.QueryRow(ctx, `
		UPDATE devices
		SET name = CASE WHEN $2 <> '' THEN $2 ELSE name END,
		    software_version = CASE WHEN $3 <> '' THEN $3 ELSE software_version END,
		    connectivity_state = $4,
		    app_health = $5,
		    last_seen_at = $6,
		    metadata = $7,
		    updated_at = now()
		WHERE id = $1
		RETURNING id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		          enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		          token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at`,
		in.DeviceID, in.Name, in.SoftwareVersion, in.ConnectivityState, in.AppHealth, in.LastSeenAt, in.Metadata,
	).Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState, &d.AppHealth,
		&enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash, &pendingTokenEnc,
		&d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update device heartbeat: %w", err)
	}
	return &d, nil
}

func (r *DeviceRepo) CreateScanEvent(ctx context.Context, in RiderScanInput) (*domain.RiderScanEvent, error) {
	var e domain.RiderScanEvent
	err := r.pool.QueryRow(ctx, `
		INSERT INTO rider_scan_events (org_id, device_id, route_id, event_uid, student_tag, scanned_at, metadata)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (device_id, event_uid) DO UPDATE SET
			student_tag = EXCLUDED.student_tag,
			scanned_at = EXCLUDED.scanned_at,
			metadata = EXCLUDED.metadata,
			sync_status = 'accepted'
		RETURNING id, org_id, device_id, route_id, event_uid, student_tag, scanned_at, sync_status, metadata, created_at`,
		in.OrgID, in.DeviceID, in.RouteID, in.EventUID, in.StudentTag, in.ScannedAt, in.Metadata,
	).Scan(
		&e.ID, &e.OrgID, &e.DeviceID, &e.RouteID, &e.EventUID, &e.StudentTag, &e.ScannedAt, &e.SyncStatus, &e.Metadata, &e.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create rider scan event: %w", err)
	}
	return &e, nil
}

func (r *DeviceRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.Device, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		       enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		       token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at
		FROM devices
		WHERE org_id = $1 AND deleted_at IS NULL
		ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list devices by org: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Device, 0)
	for rows.Next() {
		device, err := scanDevice(rows)
		if err != nil {
			return nil, fmt.Errorf("scan org device: %w", err)
		}
		items = append(items, *device)
	}
	return items, nil
}

func (r *DeviceRepo) GetByIDForOrg(ctx context.Context, orgID, id string) (*domain.Device, error) {
	return scanDevice(r.pool.QueryRow(ctx, `
		SELECT id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		       enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		       token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at
		FROM devices
		WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	))
}

func (r *DeviceRepo) UpdateAssignment(ctx context.Context, orgID, id string, vehicleID *string, name string) (*domain.Device, error) {
	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err := r.pool.QueryRow(ctx, `
		UPDATE devices
		SET vehicle_id = $3,
		    name = CASE WHEN $4 <> '' THEN $4 ELSE name END,
		    updated_at = now()
		WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		RETURNING id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		          enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		          token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at`,
		id, orgID, vehicleID, name,
	).Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState, &d.AppHealth,
		&enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash, &pendingTokenEnc,
		&d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update device assignment: %w", err)
	}
	return &d, nil
}

func (r *DeviceRepo) ResetEnrollment(ctx context.Context, orgID, id string, now time.Time) (*domain.Device, error) {
	var d domain.Device
	var enrollmentCodeHash *string
	var deviceTokenHash *string
	var pendingTokenEnc *string
	err := r.pool.QueryRow(ctx, `
		UPDATE devices
		SET org_id = NULL,
		    vehicle_id = NULL,
		    enrolled_at = NULL,
		    device_token_hash = NULL,
		    pending_device_token_enc = NULL,
		    token_issued_at = NULL,
		    revoked_at = $3,
		    enrollment_code_hash = NULL,
		    enrollment_expires_at = NULL,
		    updated_at = now()
		WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		RETURNING id, org_id, vehicle_id, device_key, name, software_version, connectivity_state, app_health,
		          enrollment_code_hash, enrollment_expires_at, enrolled_at, device_token_hash, pending_device_token_enc,
		          token_issued_at, revoked_at, last_seen_at, metadata, created_at, updated_at, deleted_at`,
		id, orgID, now,
	).Scan(
		&d.ID, &d.OrgID, &d.VehicleID, &d.DeviceKey, &d.Name, &d.SoftwareVersion, &d.ConnectivityState, &d.AppHealth,
		&enrollmentCodeHash, &d.EnrollmentExpires, &d.EnrolledAt, &deviceTokenHash, &pendingTokenEnc,
		&d.TokenIssuedAt, &d.RevokedAt, &d.LastSeenAt, &d.Metadata, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("reset device enrollment: %w", err)
	}
	return &d, nil
}

func (r *DeviceRepo) ListSoftwareReleases(ctx context.Context) ([]domain.SoftwareRelease, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, version, release_date::text, release_notes, artifact_url, artifact_sha256, installer_url,
		       target_os, target_arch, is_install_default, created_at
		FROM software_releases
		ORDER BY is_install_default DESC, release_date DESC, created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list software releases: %w", err)
	}
	defer rows.Close()

	items := make([]domain.SoftwareRelease, 0)
	for rows.Next() {
		rel, err := scanSoftwareRelease(rows)
		if err != nil {
			return nil, fmt.Errorf("scan software release: %w", err)
		}
		items = append(items, *rel)
	}
	return items, nil
}

func (r *DeviceRepo) CreateSoftwareRelease(ctx context.Context, in SoftwareReleaseCreateInput) (*domain.SoftwareRelease, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create software release: %w", err)
	}
	defer tx.Rollback(ctx)

	if in.IsInstallDefault {
		if _, err := tx.Exec(ctx, `UPDATE software_releases SET is_install_default = FALSE WHERE is_install_default = TRUE`); err != nil {
			return nil, fmt.Errorf("clear install default release: %w", err)
		}
	}

	rel, err := scanSoftwareRelease(tx.QueryRow(ctx, `
		INSERT INTO software_releases (
			version, release_date, release_notes, artifact_url, artifact_sha256, installer_url, target_os, target_arch, is_install_default
		)
		VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, version, release_date::text, release_notes, artifact_url, artifact_sha256, installer_url,
		          target_os, target_arch, is_install_default, created_at`,
		in.Version, in.ReleaseDate, in.ReleaseNotes, in.ArtifactURL, in.ArtifactSHA256, in.InstallerURL, in.TargetOS, in.TargetArch, in.IsInstallDefault,
	))
	if err != nil {
		return nil, fmt.Errorf("create software release: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create software release: %w", err)
	}
	return rel, nil
}

func (r *DeviceRepo) LatestSoftwareRelease(ctx context.Context) (*domain.SoftwareRelease, error) {
	rel, err := scanSoftwareRelease(r.pool.QueryRow(ctx, `
		SELECT id, version, release_date::text, release_notes, artifact_url, artifact_sha256, installer_url,
		       target_os, target_arch, is_install_default, created_at
		FROM software_releases
		ORDER BY release_date DESC, created_at DESC
		LIMIT 1`))
	if err != nil {
		return nil, fmt.Errorf("latest software release: %w", err)
	}
	return rel, nil
}

func (r *DeviceRepo) InstallDefaultSoftwareRelease(ctx context.Context) (*domain.SoftwareRelease, error) {
	rel, err := scanSoftwareRelease(r.pool.QueryRow(ctx, `
		SELECT id, version, release_date::text, release_notes, artifact_url, artifact_sha256, installer_url,
		       target_os, target_arch, is_install_default, created_at
		FROM software_releases
		WHERE is_install_default = TRUE
		LIMIT 1`))
	if err != nil {
		return nil, fmt.Errorf("install default software release: %w", err)
	}
	return rel, nil
}

func (r *DeviceRepo) RolloutSummary(ctx context.Context) (*domain.RolloutSummary, error) {
	var latest *domain.SoftwareRelease
	rel, err := r.LatestSoftwareRelease(ctx)
	if err == nil {
		latest = rel
	}

	rows, err := r.pool.Query(ctx, `
		SELECT
			d.id,
			d.org_id,
			o.name_enc,
			d.vehicle_id,
			v.vehicle_id,
			d.device_key,
			d.name,
			d.software_version,
			d.connectivity_state,
			d.app_health,
			d.last_seen_at
		FROM devices d
		JOIN organizations o ON o.id = d.org_id
		LEFT JOIN vehicles v ON v.id = d.vehicle_id
		WHERE d.deleted_at IS NULL
		  AND d.org_id IS NOT NULL
		  AND d.enrolled_at IS NOT NULL
		  AND o.deleted_at IS NULL
		ORDER BY o.created_at, d.last_seen_at DESC NULLS LAST, d.created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("rollout summary query: %w", err)
	}
	defer rows.Close()

	orgMap := map[string]*domain.RolloutOrgSummary{}
	order := make([]string, 0)
	summary := &domain.RolloutSummary{
		LatestRelease: latest,
		Organizations: make([]domain.RolloutOrgSummary, 0),
	}

	for rows.Next() {
		var item domain.DeviceRolloutStatus
		var orgNameEnc string
		if err := rows.Scan(
			&item.ID, &item.OrgID, &orgNameEnc, &item.VehicleID, &item.VehicleLabel, &item.DeviceKey, &item.Name,
			&item.SoftwareVersion, &item.ConnectivityState, &item.AppHealth, &item.LastSeenAt,
		); err != nil {
			return nil, fmt.Errorf("scan rollout device: %w", err)
		}
		item.OrgName = orgNameEnc

		group := orgMap[item.OrgID]
		if group == nil {
			group = &domain.RolloutOrgSummary{
				OrgID:   item.OrgID,
				OrgName: item.OrgName,
				Devices: make([]domain.DeviceRolloutStatus, 0),
			}
			orgMap[item.OrgID] = group
			order = append(order, item.OrgID)
		}
		group.TotalDevices++
		summary.TotalDevices++
		if latest != nil && item.SoftwareVersion == latest.Version {
			group.OnLatest++
			summary.OnLatest++
		} else {
			group.BehindLatest++
			summary.BehindLatest++
		}
		group.Devices = append(group.Devices, item)
	}

	for _, orgID := range order {
		group := orgMap[orgID]
		if group.TotalDevices > 0 {
			group.PercentUpToDate = float64(group.OnLatest) * 100 / float64(group.TotalDevices)
		}
		summary.Organizations = append(summary.Organizations, *group)
	}
	if summary.TotalDevices > 0 {
		summary.PercentUpToDate = float64(summary.OnLatest) * 100 / float64(summary.TotalDevices)
	}
	return summary, nil
}
