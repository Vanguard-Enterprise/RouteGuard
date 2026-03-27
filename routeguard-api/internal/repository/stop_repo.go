package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type StopRepo struct {
	pool *pgxpool.Pool
}

func NewStopRepo(pool *pgxpool.Pool) *StopRepo {
	return &StopRepo{pool: pool}
}

func (r *StopRepo) ListByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Stop, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := stopListFilter(orgID, search, status)

	countQuery := "SELECT COUNT(*) FROM stops" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count stops: %w", err)
	}

	dataQuery := `SELECT id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at
	              FROM stops` + where +
		` ORDER BY lower(name), created_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list stops: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Stop, 0)
	for rows.Next() {
		var s domain.Stop
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
			&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan stop: %w", err)
		}
		items = append(items, s)
	}

	return items, total, nil
}

func stopListFilter(orgID, search, status string) (string, []any, int) {
	clauses := []string{"org_id = $1", "deleted_at IS NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(stop_id ILIKE $`+strconv.Itoa(next)+` OR name ILIKE $`+strconv.Itoa(next)+` OR address ILIKE $`+strconv.Itoa(next)+`)`)
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

func (r *StopRepo) GetByID(ctx context.Context, orgID, id string) (*domain.Stop, error) {
	var s domain.Stop
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at
		 FROM stops
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	).Scan(
		&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
		&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get stop: %w", err)
	}
	return &s, nil
}

func (r *StopRepo) Create(ctx context.Context, stop *domain.Stop) (*domain.Stop, error) {
	var s domain.Stop
	err := r.pool.QueryRow(ctx,
		`INSERT INTO stops (org_id, stop_id, name, address, latitude, longitude, notes, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at`,
		stop.OrgID, stop.StopID, stop.Name, stop.Address, stop.Latitude, stop.Longitude, stop.Notes, stop.IsActive,
	).Scan(
		&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
		&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create stop: %w", err)
	}
	return &s, nil
}

func (r *StopRepo) Update(ctx context.Context, stop *domain.Stop) (*domain.Stop, error) {
	var s domain.Stop
	err := r.pool.QueryRow(ctx,
		`UPDATE stops
		 SET stop_id = $3, name = $4, address = $5, latitude = $6, longitude = $7, notes = $8, is_active = $9, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at`,
		stop.ID, stop.OrgID, stop.StopID, stop.Name, stop.Address, stop.Latitude, stop.Longitude, stop.Notes, stop.IsActive,
	).Scan(
		&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
		&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update stop: %w", err)
	}
	return &s, nil
}

func (r *StopRepo) SoftDelete(ctx context.Context, orgID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE stops
		 SET deleted_at = now(), updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	)
	if err != nil {
		return fmt.Errorf("delete stop: %w", err)
	}
	return nil
}

func (r *StopRepo) ListDeletedByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Stop, int, error) {
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
		clauses = append(clauses, `(stop_id ILIKE $`+strconv.Itoa(next)+` OR name ILIKE $`+strconv.Itoa(next)+` OR address ILIKE $`+strconv.Itoa(next)+`)`)
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
	countQuery := "SELECT COUNT(*) FROM stops" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deleted stops: %w", err)
	}

	dataQuery := `SELECT id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at
	              FROM stops` + where +
		` ORDER BY deleted_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deleted stops: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Stop, 0)
	for rows.Next() {
		var s domain.Stop
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
			&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan deleted stop: %w", err)
		}
		items = append(items, s)
	}

	return items, total, nil
}

func (r *StopRepo) Restore(ctx context.Context, orgID, id string) (*domain.Stop, error) {
	var s domain.Stop
	err := r.pool.QueryRow(ctx,
		`UPDATE stops
		 SET deleted_at = NULL, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NOT NULL
		 RETURNING id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at`,
		id, orgID,
	).Scan(
		&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
		&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("restore stop: %w", err)
	}
	return &s, nil
}

func (r *StopRepo) ListActiveByOrg(ctx context.Context, orgID string) ([]domain.Stop, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, stop_id, name, address, latitude, longitude, notes, is_active, created_at, updated_at, deleted_at
		 FROM stops
		 WHERE org_id = $1 AND deleted_at IS NULL AND is_active = true
		 ORDER BY lower(name)`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list active stops: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Stop, 0)
	for rows.Next() {
		var s domain.Stop
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.StopID, &s.Name, &s.Address, &s.Latitude, &s.Longitude,
			&s.Notes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan active stop: %w", err)
		}
		items = append(items, s)
	}
	return items, nil
}
