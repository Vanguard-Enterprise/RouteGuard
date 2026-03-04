package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
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

const driverSelectCols = `
    id, org_id, user_id, first_name, last_name, phone, license_number,
    license_expiry, pin_hash, rfid_badge_id, rfid_badge_id_hash,
    status, created_at, updated_at
`

func scanDriver(row pgx.Row) (*domain.Driver, error) {
	var d domain.Driver
	err := row.Scan(
		&d.ID, &d.OrgID, &d.UserID, &d.FirstName, &d.LastName,
		&d.Phone, &d.LicenseNumber, &d.LicenseExpiry, &d.PinHash,
		&d.RFIDBadgeID, &d.RFIDBadgeIDHash, &d.Status, &d.CreatedAt, &d.UpdatedAt,
	)
	return &d, err
}

// FindByID looks up a driver by their primary key.
// Returns pgx.ErrNoRows if not found.
func (r *DriverRepo) FindByID(ctx context.Context, id string) (*domain.Driver, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+driverSelectCols+` FROM drivers WHERE id = $1`, id)
	return scanDriver(row)
}

// FindByIDAndOrg looks up an active driver by ID scoped to the given org.
// Returns pgx.ErrNoRows if not found, wrong org, or driver is not active.
func (r *DriverRepo) FindByIDAndOrg(ctx context.Context, id, orgID string) (*domain.Driver, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+driverSelectCols+` FROM drivers WHERE id = $1 AND org_id = $2 AND status = 'active'`,
		id, orgID)
	return scanDriver(row)
}

// FindByRFIDHash looks up an active driver by their RFID badge ID hash within an org.
// Returns pgx.ErrNoRows if no active driver with that hash exists in the org.
func (r *DriverRepo) FindByRFIDHash(ctx context.Context, rfidHash, orgID string) (*domain.Driver, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+driverSelectCols+` FROM drivers WHERE rfid_badge_id_hash = $1 AND org_id = $2 AND status = 'active'`,
		rfidHash, orgID)
	return scanDriver(row)
}

// ListWithPINByOrg returns all active drivers in an org that have a PIN set.
// Used by PIN auth to iterate and bcrypt-compare candidates.
func (r *DriverRepo) ListWithPINByOrg(ctx context.Context, orgID string) ([]domain.Driver, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+driverSelectCols+` FROM drivers WHERE org_id = $1 AND status = 'active' AND pin_hash IS NOT NULL`,
		orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Driver
	for rows.Next() {
		d, err := scanDriver(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

// ListByOrg returns drivers for an org ordered by last_name, first_name.
// Default limit 50, max 500.
func (r *DriverRepo) ListByOrg(ctx context.Context, orgID string, limit, offset int) ([]domain.Driver, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, user_id, first_name, last_name, phone, license_number,
		       license_expiry, pin_hash, rfid_badge_id, rfid_badge_id_hash,
		       status, created_at, updated_at
		FROM drivers
		WHERE org_id = $1
		ORDER BY last_name, first_name
		LIMIT $2 OFFSET $3
	`, orgID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var drivers []domain.Driver
	for rows.Next() {
		var d domain.Driver
		if err := rows.Scan(
			&d.ID, &d.OrgID, &d.UserID, &d.FirstName, &d.LastName,
			&d.Phone, &d.LicenseNumber, &d.LicenseExpiry, &d.PinHash,
			&d.RFIDBadgeID, &d.RFIDBadgeIDHash, &d.Status, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		drivers = append(drivers, d)
	}
	return drivers, rows.Err()
}

// GetByOrg looks up a driver by ID scoped to the given org.
// Returns pgx.ErrNoRows if not found.
func (r *DriverRepo) GetByOrg(ctx context.Context, id, orgID string) (*domain.Driver, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+driverSelectCols+`
		FROM drivers
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	d, err := scanDriver(row)
	if err != nil {
		return nil, err
	}
	return d, nil
}

// CreateDriver inserts a new driver record and returns the created driver.
func (r *DriverRepo) CreateDriver(ctx context.Context, orgID string, userID *string, firstName, lastName string, phone, encLicenseNumber *string, licenseExpiry *pgtype.Date, encRFIDID, rfidHash *string, status string) (*domain.Driver, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO drivers (id, org_id, user_id, first_name, last_name, phone, license_number, license_expiry, rfid_badge_id, rfid_badge_id_hash, status)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+driverSelectCols,
		orgID, userID, firstName, lastName, phone, encLicenseNumber, licenseExpiry, encRFIDID, rfidHash, status,
	)
	return scanDriver(row)
}

// UpdateDriver applies a partial update to a driver record.
// Returns pgx.ErrNoRows if no matching driver is found.
func (r *DriverRepo) UpdateDriver(ctx context.Context, id, orgID string, firstName, lastName, phone, encLicenseNumber *string, licenseExpiry *pgtype.Date, encRFIDID, rfidHash *string, status *string) (*domain.Driver, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if firstName != nil {
		args = append(args, *firstName)
		setClauses = append(setClauses, fmt.Sprintf("first_name = $%d", len(args)))
	}
	if lastName != nil {
		args = append(args, *lastName)
		setClauses = append(setClauses, fmt.Sprintf("last_name = $%d", len(args)))
	}
	if phone != nil {
		args = append(args, *phone)
		setClauses = append(setClauses, fmt.Sprintf("phone = $%d", len(args)))
	}
	if encLicenseNumber != nil {
		args = append(args, *encLicenseNumber)
		setClauses = append(setClauses, fmt.Sprintf("license_number = $%d", len(args)))
	}
	if licenseExpiry != nil {
		args = append(args, licenseExpiry)
		setClauses = append(setClauses, fmt.Sprintf("license_expiry = $%d", len(args)))
	}
	if encRFIDID != nil {
		args = append(args, *encRFIDID)
		setClauses = append(setClauses, fmt.Sprintf("rfid_badge_id = $%d", len(args)))
		// Also update the hash
		args = append(args, rfidHash)
		setClauses = append(setClauses, fmt.Sprintf("rfid_badge_id_hash = $%d", len(args)))
	}
	if status != nil {
		args = append(args, *status)
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.GetByOrg(ctx, id, orgID)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE drivers
		SET %s, updated_at = NOW()
		WHERE id = %s AND org_id = %s
		RETURNING `+driverSelectCols,
		strings.Join(setClauses, ", "), idParam, orgParam,
	)
	row := r.pool.QueryRow(ctx, query, args...)
	return scanDriver(row)
}

// SetPIN sets a driver's PIN hash.
// Returns pgx.ErrNoRows if no matching driver is found.
func (r *DriverRepo) SetPIN(ctx context.Context, id, orgID, pinHash string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE drivers SET pin_hash = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3
	`, pinHash, id, orgID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// DeleteDriver soft-deletes a driver by setting status='inactive'.
// Returns pgx.ErrNoRows if no matching driver is found.
func (r *DriverRepo) DeleteDriver(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE drivers SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND org_id = $2
	`, id, orgID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
