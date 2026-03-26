package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type VehicleRepo struct {
	pool *pgxpool.Pool
}

func NewVehicleRepo(pool *pgxpool.Pool) *VehicleRepo {
	return &VehicleRepo{pool: pool}
}

func (r *VehicleRepo) ListByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Vehicle, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := vehicleListFilter(orgID, search, status)

	countQuery := "SELECT COUNT(*) FROM vehicles" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count vehicles: %w", err)
	}

	dataQuery := `SELECT id, org_id, vehicle_id, license_plate, capacity, is_active, created_at, updated_at, deleted_at
	              FROM vehicles` + where +
		` ORDER BY lower(vehicle_id), created_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list vehicles: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Vehicle, 0)
	for rows.Next() {
		var v domain.Vehicle
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.VehicleID, &v.LicensePlate, &v.Capacity,
			&v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan vehicle: %w", err)
		}
		items = append(items, v)
	}

	return items, total, nil
}

func vehicleListFilter(orgID, search, status string) (string, []any, int) {
	clauses := []string{"org_id = $1", "deleted_at IS NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(vehicle_id ILIKE $`+strconv.Itoa(next)+` OR license_plate ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	}

	return " WHERE " + strings.Join(clauses, " AND "), args, next
}

func (r *VehicleRepo) GetByID(ctx context.Context, orgID, id string) (*domain.Vehicle, error) {
	var v domain.Vehicle
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, vehicle_id, license_plate, capacity, is_active, created_at, updated_at, deleted_at
		 FROM vehicles
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	).Scan(
		&v.ID, &v.OrgID, &v.VehicleID, &v.LicensePlate, &v.Capacity,
		&v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get vehicle: %w", err)
	}
	return &v, nil
}

func (r *VehicleRepo) Create(ctx context.Context, vehicle *domain.Vehicle) (*domain.Vehicle, error) {
	var v domain.Vehicle
	err := r.pool.QueryRow(ctx,
		`INSERT INTO vehicles (org_id, vehicle_id, license_plate, capacity, is_active)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, vehicle_id, license_plate, capacity, is_active, created_at, updated_at, deleted_at`,
		vehicle.OrgID, vehicle.VehicleID, vehicle.LicensePlate, vehicle.Capacity, vehicle.IsActive,
	).Scan(
		&v.ID, &v.OrgID, &v.VehicleID, &v.LicensePlate, &v.Capacity,
		&v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create vehicle: %w", err)
	}
	return &v, nil
}

func (r *VehicleRepo) Update(ctx context.Context, vehicle *domain.Vehicle) (*domain.Vehicle, error) {
	var v domain.Vehicle
	err := r.pool.QueryRow(ctx,
		`UPDATE vehicles
		 SET vehicle_id = $3, license_plate = $4, capacity = $5, is_active = $6, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING id, org_id, vehicle_id, license_plate, capacity, is_active, created_at, updated_at, deleted_at`,
		vehicle.ID, vehicle.OrgID, vehicle.VehicleID, vehicle.LicensePlate, vehicle.Capacity, vehicle.IsActive,
	).Scan(
		&v.ID, &v.OrgID, &v.VehicleID, &v.LicensePlate, &v.Capacity,
		&v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update vehicle: %w", err)
	}
	return &v, nil
}

func (r *VehicleRepo) SoftDelete(ctx context.Context, orgID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE vehicles
		 SET deleted_at = now(), updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	)
	if err != nil {
		return fmt.Errorf("delete vehicle: %w", err)
	}
	return nil
}

func (r *VehicleRepo) ListDeletedByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Vehicle, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	clauses := []string{"org_id = $1", "deleted_at IS NOT NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(vehicle_id ILIKE $`+strconv.Itoa(next)+` OR license_plate ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	}

	where := " WHERE " + strings.Join(clauses, " AND ")
	countQuery := "SELECT COUNT(*) FROM vehicles" + where

	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deleted vehicles: %w", err)
	}

	dataQuery := `SELECT id, org_id, vehicle_id, license_plate, capacity, is_active, created_at, updated_at, deleted_at
	              FROM vehicles` + where +
		` ORDER BY deleted_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deleted vehicles: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Vehicle, 0)
	for rows.Next() {
		var v domain.Vehicle
		if err := rows.Scan(
			&v.ID, &v.OrgID, &v.VehicleID, &v.LicensePlate, &v.Capacity,
			&v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan deleted vehicle: %w", err)
		}
		items = append(items, v)
	}

	return items, total, nil
}

func (r *VehicleRepo) Restore(ctx context.Context, orgID, id string) (*domain.Vehicle, error) {
	var v domain.Vehicle
	err := r.pool.QueryRow(ctx,
		`UPDATE vehicles
		 SET deleted_at = NULL, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NOT NULL
		 RETURNING id, org_id, vehicle_id, license_plate, capacity, is_active, created_at, updated_at, deleted_at`,
		id, orgID,
	).Scan(
		&v.ID, &v.OrgID, &v.VehicleID, &v.LicensePlate, &v.Capacity,
		&v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("restore vehicle: %w", err)
	}
	return &v, nil
}
