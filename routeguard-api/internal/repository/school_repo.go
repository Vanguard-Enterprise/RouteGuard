package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type SchoolRepo struct {
	pool *pgxpool.Pool
}

func NewSchoolRepo(pool *pgxpool.Pool) *SchoolRepo {
	return &SchoolRepo{pool: pool}
}

func (r *SchoolRepo) ListByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.School, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := schoolListFilter(orgID, search, status)

	countQuery := "SELECT COUNT(*) FROM schools" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count schools: %w", err)
	}

	dataQuery := `SELECT id, org_id, school_id, name, address, contact_phone, is_active, created_at, updated_at, deleted_at
	              FROM schools` + where +
		` ORDER BY lower(name), created_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list schools: %w", err)
	}
	defer rows.Close()

	items := make([]domain.School, 0)
	for rows.Next() {
		var s domain.School
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.SchoolID, &s.Name, &s.Address,
			&s.ContactPhone, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan school: %w", err)
		}
		items = append(items, s)
	}

	return items, total, nil
}

func schoolListFilter(orgID, search, status string) (string, []any, int) {
	clauses := []string{"org_id = $1", "deleted_at IS NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(school_id ILIKE $`+strconv.Itoa(next)+` OR name ILIKE $`+strconv.Itoa(next)+` OR address ILIKE $`+strconv.Itoa(next)+` OR contact_phone ILIKE $`+strconv.Itoa(next)+`)`)
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

func (r *SchoolRepo) GetByID(ctx context.Context, orgID, id string) (*domain.School, error) {
	var s domain.School
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, school_id, name, address, contact_phone, is_active, created_at, updated_at, deleted_at
		 FROM schools
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	).Scan(
		&s.ID, &s.OrgID, &s.SchoolID, &s.Name, &s.Address,
		&s.ContactPhone, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get school: %w", err)
	}
	return &s, nil
}

func (r *SchoolRepo) Create(ctx context.Context, school *domain.School) (*domain.School, error) {
	var s domain.School
	err := r.pool.QueryRow(ctx,
		`INSERT INTO schools (org_id, school_id, name, address, contact_phone, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, org_id, school_id, name, address, contact_phone, is_active, created_at, updated_at, deleted_at`,
		school.OrgID, school.SchoolID, school.Name, school.Address, school.ContactPhone, school.IsActive,
	).Scan(
		&s.ID, &s.OrgID, &s.SchoolID, &s.Name, &s.Address,
		&s.ContactPhone, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create school: %w", err)
	}
	return &s, nil
}

func (r *SchoolRepo) Update(ctx context.Context, school *domain.School) (*domain.School, error) {
	var s domain.School
	err := r.pool.QueryRow(ctx,
		`UPDATE schools
		 SET name = $3, address = $4, contact_phone = $5, is_active = $6, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING id, org_id, school_id, name, address, contact_phone, is_active, created_at, updated_at, deleted_at`,
		school.ID, school.OrgID, school.Name, school.Address, school.ContactPhone, school.IsActive,
	).Scan(
		&s.ID, &s.OrgID, &s.SchoolID, &s.Name, &s.Address,
		&s.ContactPhone, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update school: %w", err)
	}
	return &s, nil
}

func (r *SchoolRepo) SoftDelete(ctx context.Context, orgID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE schools
		 SET deleted_at = now(), updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	)
	if err != nil {
		return fmt.Errorf("delete school: %w", err)
	}
	return nil
}

func (r *SchoolRepo) ListDeletedByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.School, int, error) {
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
		clauses = append(clauses, `(school_id ILIKE $`+strconv.Itoa(next)+` OR name ILIKE $`+strconv.Itoa(next)+` OR address ILIKE $`+strconv.Itoa(next)+` OR contact_phone ILIKE $`+strconv.Itoa(next)+`)`)
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
	countQuery := "SELECT COUNT(*) FROM schools" + where

	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deleted schools: %w", err)
	}

	dataQuery := `SELECT id, org_id, school_id, name, address, contact_phone, is_active, created_at, updated_at, deleted_at
	              FROM schools` + where +
		` ORDER BY deleted_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deleted schools: %w", err)
	}
	defer rows.Close()

	items := make([]domain.School, 0)
	for rows.Next() {
		var s domain.School
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.SchoolID, &s.Name, &s.Address,
			&s.ContactPhone, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan deleted school: %w", err)
		}
		items = append(items, s)
	}

	return items, total, nil
}

func (r *SchoolRepo) Restore(ctx context.Context, orgID, id string) (*domain.School, error) {
	var s domain.School
	err := r.pool.QueryRow(ctx,
		`UPDATE schools
		 SET deleted_at = NULL, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NOT NULL
		 RETURNING id, org_id, school_id, name, address, contact_phone, is_active, created_at, updated_at, deleted_at`,
		id, orgID,
	).Scan(
		&s.ID, &s.OrgID, &s.SchoolID, &s.Name, &s.Address,
		&s.ContactPhone, &s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("restore school: %w", err)
	}
	return &s, nil
}
