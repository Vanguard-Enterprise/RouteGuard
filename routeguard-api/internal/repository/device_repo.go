package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
)

const (
	deviceCacheKeyPrefix   = "device:"
	deviceCacheTTL         = 5 * time.Minute
	deviceLastSeenPrefix   = "device_last_seen:"
	deviceLastSeenTTL      = 2 * time.Minute
)

// DeviceRepo handles device queries.
type DeviceRepo struct {
	pool *pgxpool.Pool
}

// NewDeviceRepo creates a new DeviceRepo.
func NewDeviceRepo(pool *pgxpool.Pool) *DeviceRepo {
	return &DeviceRepo{pool: pool}
}

// FindByID returns a device by its primary key.
// Returns pgx.ErrNoRows if not found.
func (r *DeviceRepo) FindByID(ctx context.Context, id string) (*domain.Device, error) {
	var d domain.Device
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, serial, device_token_hash, status, vehicle_id,
		       seat_count, bus_layout, provisioned_at, created_at
		FROM devices
		WHERE id = $1
	`, id).Scan(
		&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status,
		&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
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
		// Unexpected Redis error — fall through to DB to stay available.
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
		// Non-fatal — the caller still gets the device from the DB.
		_ = err
	}

	return device, nil
}

// Create inserts a new device record with status 'provisioned'.
// Returns the newly created device including its generated ID.
func (r *DeviceRepo) Create(ctx context.Context, orgID, serial, tokenHash string) (*domain.Device, error) {
	var d domain.Device
	err := r.pool.QueryRow(ctx, `
		INSERT INTO devices (org_id, serial, device_token_hash, status, provisioned_at)
		VALUES ($1, $2, $3, 'provisioned', NOW())
		RETURNING id, org_id, serial, device_token_hash, status, vehicle_id,
		          seat_count, bus_layout, provisioned_at, created_at
	`, orgID, serial, tokenHash).Scan(
		&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status,
		&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create device: %w", err)
	}
	return &d, nil
}

// FindTokenHash returns the device_token_hash for a device by ID.
// Used exclusively for credential verification — bypasses cache.
func (r *DeviceRepo) FindTokenHash(ctx context.Context, id string) (string, error) {
	var hash string
	err := r.pool.QueryRow(ctx,
		"SELECT device_token_hash FROM devices WHERE id = $1", id,
	).Scan(&hash)
	return hash, err
}

// UpdateLastSeen records the current unix timestamp for the device in Redis.
// Key: "device_last_seen:<id>", TTL: 2 minutes.
func (r *DeviceRepo) UpdateLastSeen(ctx context.Context, id string, c *cache.Cache) error {
	key := deviceLastSeenPrefix + id
	ts := time.Now().Unix()
	return c.Set(ctx, key, ts, deviceLastSeenTTL)
}

