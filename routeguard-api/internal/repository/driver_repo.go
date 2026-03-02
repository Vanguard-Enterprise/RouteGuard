package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// DriverRepo handles driver queries.
type DriverRepo struct {
	pool *pgxpool.Pool
}

// NewDriverRepo creates a new DriverRepo.
func NewDriverRepo(pool *pgxpool.Pool) *DriverRepo {
	return &DriverRepo{pool: pool}
}

// FindByID looks up a driver by their primary key.
// Returns pgx.ErrNoRows if not found.
func (r *DriverRepo) FindByID(ctx context.Context, id string) (*domain.Driver, error) {
	var d domain.Driver
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, user_id, first_name, last_name, phone, license_number,
		       license_expiry, pin_hash, rfid_badge_id, rfid_badge_id_hash,
		       status, created_at, updated_at
		FROM drivers
		WHERE id = $1
	`, id).Scan(
		&d.ID, &d.OrgID, &d.UserID, &d.FirstName, &d.LastName, &d.Phone,
		&d.LicenseNumber, &d.LicenseExpiry, &d.PinHash, &d.RFIDBadgeID,
		&d.RFIDBadgeIDHash, &d.Status, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// FindByRFIDHash looks up an active driver by their RFID badge ID hash within an org.
// Returns pgx.ErrNoRows if no active driver with that hash exists in the org.
func (r *DriverRepo) FindByRFIDHash(ctx context.Context, rfidHash, orgID string) (*domain.Driver, error) {
	var d domain.Driver
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, user_id, first_name, last_name, phone, license_number,
		       license_expiry, pin_hash, rfid_badge_id, rfid_badge_id_hash,
		       status, created_at, updated_at
		FROM drivers
		WHERE rfid_badge_id_hash = $1
		  AND org_id = $2
		  AND status = 'active'
	`, rfidHash, orgID).Scan(
		&d.ID, &d.OrgID, &d.UserID, &d.FirstName, &d.LastName, &d.Phone,
		&d.LicenseNumber, &d.LicenseExpiry, &d.PinHash, &d.RFIDBadgeID,
		&d.RFIDBadgeIDHash, &d.Status, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}
