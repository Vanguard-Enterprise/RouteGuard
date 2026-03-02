package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// SchoolRepo handles school queries.
type SchoolRepo struct {
	pool *pgxpool.Pool
}

// NewSchoolRepo creates a new SchoolRepo.
func NewSchoolRepo(pool *pgxpool.Pool) *SchoolRepo {
	return &SchoolRepo{pool: pool}
}

const schoolSelectCols = `
	id, org_id, name, address, city, state, zip, lat, lng,
	phone, contact_name, contact_email, created_at, updated_at
`

func scanSchool(row pgx.Row) (*domain.School, error) {
	var s domain.School
	err := row.Scan(
		&s.ID, &s.OrgID, &s.Name, &s.Address, &s.City, &s.State,
		&s.Zip, &s.Lat, &s.Lng, &s.Phone, &s.ContactName,
		&s.ContactEmail, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// List returns a paginated list of schools for the given org, ordered by name.
func (r *SchoolRepo) List(ctx context.Context, orgID string, limit, offset int) ([]domain.School, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+schoolSelectCols+`
		FROM schools
		WHERE org_id = $1
		ORDER BY name
		LIMIT $2 OFFSET $3
	`, orgID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("school list: %w", err)
	}
	defer rows.Close()

	schools := make([]domain.School, 0)
	for rows.Next() {
		var s domain.School
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.Name, &s.Address, &s.City, &s.State,
			&s.Zip, &s.Lat, &s.Lng, &s.Phone, &s.ContactName,
			&s.ContactEmail, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		schools = append(schools, s)
	}
	return schools, rows.Err()
}

// Get returns a school by ID scoped to orgID. Returns pgx.ErrNoRows if not found or wrong org.
func (r *SchoolRepo) Get(ctx context.Context, id, orgID string) (*domain.School, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+schoolSelectCols+`
		FROM schools
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	s, err := scanSchool(row)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Create inserts a new school and returns the created row.
func (r *SchoolRepo) Create(ctx context.Context, orgID, name string, address, city, state, zip *string, lat, lng *float64, phone, contactName, contactEmail *string) (*domain.School, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO schools (id, org_id, name, address, city, state, zip, lat, lng, phone, contact_name, contact_email)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING `+schoolSelectCols,
		orgID, name, address, city, state, zip, lat, lng, phone, contactName, contactEmail,
	)
	s, err := scanSchool(row)
	if err != nil {
		return nil, fmt.Errorf("school create: %w", err)
	}
	return s, nil
}

// Update applies a partial update to a school scoped to orgID. Only non-nil fields are updated.
// If no fields are provided, returns the current school via Get.
func (r *SchoolRepo) Update(ctx context.Context, id, orgID string, name, address, city, state, zip *string, lat, lng *float64, phone, contactName, contactEmail *string) (*domain.School, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if name != nil {
		args = append(args, *name)
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", len(args)))
	}
	if address != nil {
		args = append(args, *address)
		setClauses = append(setClauses, fmt.Sprintf("address = $%d", len(args)))
	}
	if city != nil {
		args = append(args, *city)
		setClauses = append(setClauses, fmt.Sprintf("city = $%d", len(args)))
	}
	if state != nil {
		args = append(args, *state)
		setClauses = append(setClauses, fmt.Sprintf("state = $%d", len(args)))
	}
	if zip != nil {
		args = append(args, *zip)
		setClauses = append(setClauses, fmt.Sprintf("zip = $%d", len(args)))
	}
	if lat != nil {
		args = append(args, *lat)
		setClauses = append(setClauses, fmt.Sprintf("lat = $%d", len(args)))
	}
	if lng != nil {
		args = append(args, *lng)
		setClauses = append(setClauses, fmt.Sprintf("lng = $%d", len(args)))
	}
	if phone != nil {
		args = append(args, *phone)
		setClauses = append(setClauses, fmt.Sprintf("phone = $%d", len(args)))
	}
	if contactName != nil {
		args = append(args, *contactName)
		setClauses = append(setClauses, fmt.Sprintf("contact_name = $%d", len(args)))
	}
	if contactEmail != nil {
		args = append(args, *contactEmail)
		setClauses = append(setClauses, fmt.Sprintf("contact_email = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id, orgID)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE schools
		SET %s, updated_at = NOW()
		WHERE id = %s AND org_id = %s
		RETURNING `+schoolSelectCols,
		strings.Join(setClauses, ", "), idParam, orgParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	s, err := scanSchool(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("school update: %w", err)
	}
	return s, nil
}

// Delete removes a school by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *SchoolRepo) Delete(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM schools WHERE id = $1 AND org_id = $2", id, orgID)
	if err != nil {
		return fmt.Errorf("school delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
