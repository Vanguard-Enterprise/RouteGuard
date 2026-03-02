package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// VehicleRepo handles vehicle queries.
type VehicleRepo struct {
	pool *pgxpool.Pool
}

// NewVehicleRepo creates a new VehicleRepo.
func NewVehicleRepo(pool *pgxpool.Pool) *VehicleRepo {
	return &VehicleRepo{pool: pool}
}

const vehicleSelectCols = `
    id, org_id, name, number, capacity, year, make, model, vin, license_plate,
    status, created_at, updated_at
`

func scanVehicle(row pgx.Row) (*domain.Vehicle, error) {
	var v domain.Vehicle
	if err := row.Scan(
		&v.ID, &v.OrgID, &v.Name, &v.Number, &v.Capacity, &v.Year,
		&v.Make, &v.Model, &v.VIN, &v.LicensePlate, &v.Status,
		&v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &v, nil
}

// List returns a paginated list of vehicles for the given org, ordered by name.
func (r *VehicleRepo) List(ctx context.Context, orgID string, limit, offset int) ([]domain.Vehicle, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+vehicleSelectCols+`
		FROM vehicles
		WHERE org_id = $1
		ORDER BY name
		LIMIT $2 OFFSET $3
	`, orgID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("vehicle list: %w", err)
	}
	defer rows.Close()

	vehicles := make([]domain.Vehicle, 0)
	for rows.Next() {
		var v domain.Vehicle
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.Name, &v.Number, &v.Capacity, &v.Year,
			&v.Make, &v.Model, &v.VIN, &v.LicensePlate, &v.Status,
			&v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("vehicle list scan: %w", err)
		}
		vehicles = append(vehicles, v)
	}
	return vehicles, rows.Err()
}

// Get returns a vehicle by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *VehicleRepo) Get(ctx context.Context, id, orgID string) (*domain.Vehicle, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+vehicleSelectCols+`
		FROM vehicles
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	return scanVehicle(row)
}

// Create inserts a new vehicle record and returns the created vehicle.
func (r *VehicleRepo) Create(ctx context.Context, orgID, name string, number *string, capacity, year *int, make_, model, vin, licensePlate *string, status string) (*domain.Vehicle, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO vehicles (id, org_id, name, number, capacity, year, make, model, vin, license_plate, status)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+vehicleSelectCols,
		orgID, name, number, capacity, year, make_, model, vin, licensePlate, status,
	)
	v, err := scanVehicle(row)
	if err != nil {
		return nil, fmt.Errorf("vehicle create: %w", err)
	}
	return v, nil
}

// Update applies a partial update to a vehicle scoped to orgID. Only non-nil fields are updated.
// If no fields are provided, returns the current vehicle via Get.
// Returns pgx.ErrNoRows if no matching vehicle is found.
func (r *VehicleRepo) Update(ctx context.Context, id, orgID string, name, number *string, capacity, year *int, make_, model, vin, licensePlate, status *string) (*domain.Vehicle, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if name != nil {
		args = append(args, *name)
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", len(args)))
	}
	if number != nil {
		args = append(args, *number)
		setClauses = append(setClauses, fmt.Sprintf("number = $%d", len(args)))
	}
	if capacity != nil {
		args = append(args, *capacity)
		setClauses = append(setClauses, fmt.Sprintf("capacity = $%d", len(args)))
	}
	if year != nil {
		args = append(args, *year)
		setClauses = append(setClauses, fmt.Sprintf("year = $%d", len(args)))
	}
	if make_ != nil {
		args = append(args, *make_)
		setClauses = append(setClauses, fmt.Sprintf("make = $%d", len(args)))
	}
	if model != nil {
		args = append(args, *model)
		setClauses = append(setClauses, fmt.Sprintf("model = $%d", len(args)))
	}
	if vin != nil {
		args = append(args, *vin)
		setClauses = append(setClauses, fmt.Sprintf("vin = $%d", len(args)))
	}
	if licensePlate != nil {
		args = append(args, *licensePlate)
		setClauses = append(setClauses, fmt.Sprintf("license_plate = $%d", len(args)))
	}
	if status != nil {
		args = append(args, *status)
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id, orgID)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE vehicles
		SET %s, updated_at = NOW()
		WHERE id = %s AND org_id = %s
		RETURNING `+vehicleSelectCols,
		strings.Join(setClauses, ", "), idParam, orgParam,
	)
	row := r.pool.QueryRow(ctx, query, args...)
	v, err := scanVehicle(row)
	if err != nil {
		return nil, fmt.Errorf("vehicle update: %w", err)
	}
	return v, nil
}

// Delete hard-deletes a vehicle by ID scoped to orgID.
// Returns pgx.ErrNoRows if no matching vehicle is found.
// Note: devices.vehicle_id has ON DELETE SET NULL so no FK restriction.
func (r *VehicleRepo) Delete(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM vehicles WHERE id = $1 AND org_id = $2", id, orgID)
	if err != nil {
		return fmt.Errorf("vehicle delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
