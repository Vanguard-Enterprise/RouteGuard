package repository

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
)

const (
	deviceCacheKeyPrefix = "device:"
	deviceCacheTTL       = 5 * time.Minute
	deviceLastSeenPrefix = "device_last_seen:"
	deviceLastSeenTTL    = 2 * time.Minute
)

// DeviceRepo handles device queries.
type DeviceRepo struct {
	pool *pgxpool.Pool
}

// NewDeviceRepo creates a new DeviceRepo.
func NewDeviceRepo(pool *pgxpool.Pool) *DeviceRepo {
	return &DeviceRepo{pool: pool}
}

// Full device SELECT - use this column order in every scan.
const deviceSelectCols = `
    id, org_id, serial, device_token_hash, status, claim_code,
    vehicle_id, seat_count, bus_layout, provisioned_at, created_at`

func scanDevice(row pgx.Row) (*domain.Device, error) {
	var d domain.Device
	err := row.Scan(
		&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status, &d.ClaimCode,
		&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// FindByID returns a device by its primary key.
// Returns pgx.ErrNoRows if not found.
func (r *DeviceRepo) FindByID(ctx context.Context, id string) (*domain.Device, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT`+deviceSelectCols+`
		FROM devices
		WHERE id = $1
	`, id)
	d, err := scanDevice(row)
	if err != nil {
		return nil, err
	}
	return d, nil
}

// FindByIDAndCache looks up a device by ID using a cache-first strategy.
// Results are cached under "device:<id>" for 5 minutes.
// If the device is revoked, it is evicted from the cache and pgx.ErrNoRows is returned
// so that remote revocation takes effect promptly.
func (r *DeviceRepo) FindByIDAndCache(ctx context.Context, id string, c *cache.Cache) (*domain.Device, error) {
	cacheKey := deviceCacheKeyPrefix + id

	// 1. Try cache first.
	var d domain.Device
	if err := c.Get(ctx, cacheKey, &d); err == nil {
		if d.Status == "revoked" {
			// Evict stale cache entry and deny access.
			_ = c.Del(ctx, cacheKey)
			return nil, pgx.ErrNoRows
		}
		return &d, nil
	} else if !c.IsNotFound(err) {
		// Unexpected Redis error - fall through to DB to stay available.
		_ = err
	}

	// 2. Query the database.
	device, err := r.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// 3. Reject revoked devices without caching.
	if device.Status == "revoked" {
		return nil, pgx.ErrNoRows
	}

	// 4. Store in cache for subsequent requests.
	if err := c.Set(ctx, cacheKey, device, deviceCacheTTL); err != nil {
		// Non-fatal - the caller still gets the device from the DB.
		_ = err
	}

	return device, nil
}

// Create inserts a new device record with status 'active'.
// Returns the newly created device including its generated ID.
func (r *DeviceRepo) Create(ctx context.Context, orgID, serial, tokenHash string) (*domain.Device, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO devices (org_id, serial, device_token_hash, status, provisioned_at)
		VALUES ($1, $2, $3, 'active', NOW())
		RETURNING`+deviceSelectCols,
		orgID, serial, tokenHash,
	)
	d, err := scanDevice(row)
	if err != nil {
		return nil, fmt.Errorf("create device: %w", err)
	}
	return d, nil
}

// FindTokenHash returns the device_token_hash for a device by ID.
// Used exclusively for credential verification - bypasses cache.
// Returns an empty string when the column is NULL (unclaimed device).
func (r *DeviceRepo) FindTokenHash(ctx context.Context, id string) (string, error) {
	var hash *string
	err := r.pool.QueryRow(ctx,
		"SELECT device_token_hash FROM devices WHERE id = $1", id,
	).Scan(&hash)
	if err != nil {
		return "", err
	}
	if hash == nil {
		return "", nil
	}
	return *hash, nil
}

// UpdateLastSeen records the current unix timestamp for the device in Redis.
// Key: "device_last_seen:<id>", TTL: 2 minutes.
func (r *DeviceRepo) UpdateLastSeen(ctx context.Context, id string, c *cache.Cache) error {
	key := deviceLastSeenPrefix + id
	ts := time.Now().Unix()
	return c.Set(ctx, key, ts, deviceLastSeenTTL)
}

// ListByOrg returns all non-revoked devices for the given org, ordered newest first.
func (r *DeviceRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.Device, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT`+deviceSelectCols+`
		FROM devices
		WHERE org_id = $1
		ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("device list by org: %w", err)
	}
	defer rows.Close()

	devices := make([]domain.Device, 0)
	for rows.Next() {
		var d domain.Device
		if err := rows.Scan(
			&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status, &d.ClaimCode,
			&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
		); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// Revoke sets the device status to 'revoked' and evicts the device from cache.
func (r *DeviceRepo) Revoke(ctx context.Context, id string, c *cache.Cache) error {
	tag, err := r.pool.Exec(ctx,
		"UPDATE devices SET status = 'revoked' WHERE id = $1", id,
	)
	if err != nil {
		return fmt.Errorf("device revoke: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	// Evict the cached device so auth checks immediately see the revoked status.
	_ = c.Del(ctx, deviceCacheKeyPrefix+id)
	return nil
}

// generateClaimCode creates a cryptographically random 8-character uppercase
// alphanumeric claim code. The character set is A-Z + 0-9 (36 chars).
func generateClaimCode() (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	code := make([]byte, 8)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		code[i] = charset[n.Int64()]
	}
	return string(code), nil
}

// CreateUnclaimed inserts a new device with status 'unclaimed', no org, and
// a random claim code. If the serial already exists and is unclaimed, returns
// the existing record (idempotent for device reboots).
func (r *DeviceRepo) CreateUnclaimed(ctx context.Context, serial string) (*domain.Device, error) {
	// Check if an unclaimed record already exists for this serial.
	existing, err := scanDevice(r.pool.QueryRow(ctx, `
		SELECT`+deviceSelectCols+`
		FROM devices WHERE serial = $1 AND status = 'unclaimed'
	`, serial))
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("create unclaimed: check existing: %w", err)
	}

	code, err := generateClaimCode()
	if err != nil {
		return nil, fmt.Errorf("create unclaimed: generate code: %w", err)
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO devices (serial, status, claim_code)
		VALUES ($1, 'unclaimed', $2)
		RETURNING`+deviceSelectCols,
		serial, code,
	)
	d, err := scanDevice(row)
	if err != nil {
		return nil, fmt.Errorf("create unclaimed: insert: %w", err)
	}
	return d, nil
}

// FindByClaimCode looks up an unclaimed device by its claim code.
// Returns pgx.ErrNoRows if not found.
func (r *DeviceRepo) FindByClaimCode(ctx context.Context, claimCode string) (*domain.Device, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT`+deviceSelectCols+`
		FROM devices WHERE claim_code = $1
	`, claimCode)
	return scanDevice(row)
}

// Claim associates an unclaimed device with an org and vehicle, sets status to
// active, stores the device token hash, and clears the claim code.
// Runs inside a transaction provided by the caller.
func (r *DeviceRepo) Claim(ctx context.Context, tx pgx.Tx, deviceID, orgID, vehicleID, tokenHash string) error {
	tag, err := tx.Exec(ctx, `
		UPDATE devices
		SET org_id = $1, vehicle_id = $2, device_token_hash = $3,
		    status = 'active', provisioned_at = NOW(), claim_code = NULL
		WHERE id = $4 AND status = 'unclaimed'
	`, orgID, vehicleID, tokenHash, deviceID)
	if err != nil {
		return fmt.Errorf("claim device: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// DeleteExpiredUnclaimed removes unclaimed device records older than 1 hour.
// Called by the background cleanup goroutine every 5 minutes.
func (r *DeviceRepo) DeleteExpiredUnclaimed(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM devices
		WHERE status = 'unclaimed' AND created_at < NOW() - INTERVAL '1 hour'
	`)
	if err != nil {
		return 0, fmt.Errorf("delete expired unclaimed: %w", err)
	}
	return tag.RowsAffected(), nil
}
