package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type DriverRepo struct {
	pool *pgxpool.Pool
}

func NewDriverRepo(pool *pgxpool.Pool) *DriverRepo {
	return &DriverRepo{pool: pool}
}

const driverSelectColumns = `id, org_id, driver_id, name, phone, is_available, is_active, pin_hash, pin_lookup_hash, pin_updated_at, created_at, updated_at, deleted_at`

type driverScanner interface {
	Scan(dest ...any) error
}

func scanDriver(scanner driverScanner) (*domain.Driver, error) {
	var d domain.Driver
	if err := scanner.Scan(
		&d.ID,
		&d.OrgID,
		&d.DriverID,
		&d.Name,
		&d.Phone,
		&d.IsAvailable,
		&d.IsActive,
		&d.PinHash,
		&d.PinLookupHash,
		&d.PinUpdatedAt,
		&d.CreatedAt,
		&d.UpdatedAt,
		&d.DeletedAt,
	); err != nil {
		return nil, err
	}
	d.HasPIN = d.PinHash != nil && *d.PinHash != ""
	return &d, nil
}

func (r *DriverRepo) ListByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Driver, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := driverListFilter(orgID, search, status)

	countQuery := "SELECT COUNT(*) FROM drivers" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count drivers: %w", err)
	}

	dataQuery := `SELECT ` + driverSelectColumns + `
	              FROM drivers` + where +
		` ORDER BY lower(name), created_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list drivers: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Driver, 0)
	for rows.Next() {
		d, err := scanDriver(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan driver: %w", err)
		}
		items = append(items, *d)
	}

	return items, total, nil
}

func driverListFilter(orgID, search, status string) (string, []any, int) {
	clauses := []string{"org_id = $1", "deleted_at IS NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(driver_id ILIKE $`+strconv.Itoa(next)+` OR name ILIKE $`+strconv.Itoa(next)+` OR phone ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	case "available":
		clauses = append(clauses, "is_available = true")
	case "unavailable":
		clauses = append(clauses, "is_available = false")
	}

	return " WHERE " + strings.Join(clauses, " AND "), args, next
}

func (r *DriverRepo) GetByID(ctx context.Context, orgID, id string) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`SELECT `+driverSelectColumns+`
		 FROM drivers
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	))
	if err != nil {
		return nil, fmt.Errorf("get driver: %w", err)
	}
	return d, nil
}

func (r *DriverRepo) Create(ctx context.Context, driver *domain.Driver) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`INSERT INTO drivers (org_id, driver_id, name, phone, is_available, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING `+driverSelectColumns,
		driver.OrgID, driver.DriverID, driver.Name, driver.Phone, driver.IsAvailable, driver.IsActive,
	))
	if err != nil {
		return nil, fmt.Errorf("create driver: %w", err)
	}
	return d, nil
}

func (r *DriverRepo) Update(ctx context.Context, driver *domain.Driver) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`UPDATE drivers
		 SET driver_id = $3, name = $4, phone = $5, is_available = $6, is_active = $7, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING `+driverSelectColumns,
		driver.ID, driver.OrgID, driver.DriverID, driver.Name, driver.Phone, driver.IsAvailable, driver.IsActive,
	))
	if err != nil {
		return nil, fmt.Errorf("update driver: %w", err)
	}
	return d, nil
}

func (r *DriverRepo) SoftDelete(ctx context.Context, orgID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE drivers
		 SET deleted_at = now(), updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	)
	if err != nil {
		return fmt.Errorf("delete driver: %w", err)
	}
	return nil
}

func (r *DriverRepo) ListDeletedByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Driver, int, error) {
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
		clauses = append(clauses, `(driver_id ILIKE $`+strconv.Itoa(next)+` OR name ILIKE $`+strconv.Itoa(next)+` OR phone ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	case "available":
		clauses = append(clauses, "is_available = true")
	case "unavailable":
		clauses = append(clauses, "is_available = false")
	}

	where := " WHERE " + strings.Join(clauses, " AND ")
	countQuery := "SELECT COUNT(*) FROM drivers" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deleted drivers: %w", err)
	}

	dataQuery := `SELECT ` + driverSelectColumns + `
	              FROM drivers` + where +
		` ORDER BY deleted_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deleted drivers: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Driver, 0)
	for rows.Next() {
		d, err := scanDriver(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan deleted driver: %w", err)
		}
		items = append(items, *d)
	}

	return items, total, nil
}

func (r *DriverRepo) Restore(ctx context.Context, orgID, id string) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`UPDATE drivers
		 SET deleted_at = NULL, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NOT NULL
		 RETURNING `+driverSelectColumns,
		id, orgID,
	))
	if err != nil {
		return nil, fmt.Errorf("restore driver: %w", err)
	}
	return d, nil
}

func (r *DriverRepo) SetPIN(ctx context.Context, orgID, id, pinHash, pinLookupHash string, pinUpdatedAt time.Time) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`UPDATE drivers
		 SET pin_hash = $3,
		     pin_lookup_hash = $4,
		     pin_updated_at = $5,
		     updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING `+driverSelectColumns,
		id, orgID, pinHash, pinLookupHash, pinUpdatedAt,
	))
	if err != nil {
		return nil, fmt.Errorf("set driver pin: %w", err)
	}
	return d, nil
}

func (r *DriverRepo) ClearPIN(ctx context.Context, orgID, id string) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`UPDATE drivers
		 SET pin_hash = NULL,
		     pin_lookup_hash = NULL,
		     pin_updated_at = NULL,
		     updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING `+driverSelectColumns,
		id, orgID,
	))
	if err != nil {
		return nil, fmt.Errorf("clear driver pin: %w", err)
	}
	return d, nil
}

func (r *DriverRepo) FindActiveByPINLookup(ctx context.Context, orgID, pinLookupHash string) (*domain.Driver, error) {
	d, err := scanDriver(r.pool.QueryRow(ctx,
		`SELECT `+driverSelectColumns+`
		 FROM drivers
		 WHERE org_id = $1
		   AND pin_lookup_hash = $2
		   AND is_active = TRUE
		   AND deleted_at IS NULL`,
		orgID, pinLookupHash,
	))
	if err != nil {
		return nil, fmt.Errorf("find active driver by pin lookup: %w", err)
	}
	return d, nil
}
