package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// OrgRepo handles organization queries.
type OrgRepo struct {
	pool *pgxpool.Pool
}

// NewOrgRepo creates a new OrgRepo.
func NewOrgRepo(pool *pgxpool.Pool) *OrgRepo {
	return &OrgRepo{pool: pool}
}

const orgSelectCols = `
	id, name, slug, type, logo_url, timezone, settings, created_at, updated_at
`

func scanOrg(row pgx.Row) (*domain.Organization, error) {
	var o domain.Organization
	err := row.Scan(
		&o.ID, &o.Name, &o.Slug, &o.Type, &o.LogoURL,
		&o.Timezone, &o.Settings, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &o, nil
}

// List returns all organizations ordered by name.
func (r *OrgRepo) List(ctx context.Context) ([]domain.Organization, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+orgSelectCols+`
		FROM organizations
		ORDER BY name
	`)
	if err != nil {
		return nil, fmt.Errorf("org list: %w", err)
	}
	defer rows.Close()

	orgs := make([]domain.Organization, 0)
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(
			&o.ID, &o.Name, &o.Slug, &o.Type, &o.LogoURL,
			&o.Timezone, &o.Settings, &o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			return nil, err
		}
		orgs = append(orgs, o)
	}
	return orgs, rows.Err()
}

// Get returns an org by ID. Returns pgx.ErrNoRows if not found.
func (r *OrgRepo) Get(ctx context.Context, id string) (*domain.Organization, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+orgSelectCols+`
		FROM organizations
		WHERE id = $1
	`, id)
	o, err := scanOrg(row)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// GetBySlug returns an org by slug. Returns pgx.ErrNoRows if not found.
func (r *OrgRepo) GetBySlug(ctx context.Context, slug string) (*domain.Organization, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+orgSelectCols+`
		FROM organizations
		WHERE slug = $1
	`, slug)
	o, err := scanOrg(row)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// Create inserts a new organization and returns the created row.
func (r *OrgRepo) Create(ctx context.Context, name, slug, orgType, timezone string, settings json.RawMessage) (*domain.Organization, error) {
	if settings == nil {
		settings = json.RawMessage("{}")
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO organizations (id, name, slug, type, timezone, settings)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
		RETURNING `+orgSelectCols,
		name, slug, orgType, timezone, settings,
	)
	o, err := scanOrg(row)
	if err != nil {
		return nil, fmt.Errorf("org create: %w", err)
	}
	return o, nil
}

// Update applies a partial update to an organization. Only non-nil fields are updated.
// If no fields are provided, returns the current org via Get.
func (r *OrgRepo) Update(ctx context.Context, id string, name, slug, timezone *string, settings json.RawMessage, logoURL *string) (*domain.Organization, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if name != nil {
		args = append(args, *name)
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", len(args)))
	}
	if slug != nil {
		args = append(args, *slug)
		setClauses = append(setClauses, fmt.Sprintf("slug = $%d", len(args)))
	}
	if timezone != nil {
		args = append(args, *timezone)
		setClauses = append(setClauses, fmt.Sprintf("timezone = $%d", len(args)))
	}
	if settings != nil {
		args = append(args, settings)
		setClauses = append(setClauses, fmt.Sprintf("settings = $%d", len(args)))
	}
	if logoURL != nil {
		args = append(args, *logoURL)
		setClauses = append(setClauses, fmt.Sprintf("logo_url = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE organizations
		SET %s, updated_at = NOW()
		WHERE id = %s
		RETURNING `+orgSelectCols,
		strings.Join(setClauses, ", "), idParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	o, err := scanOrg(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("org update: %w", err)
	}
	return o, nil
}

// Delete removes an organization by ID. Returns pgx.ErrNoRows if not found.
func (r *OrgRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM organizations WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("org delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// CheckSlug returns true if an organization with the given id has the given slug.
func (r *OrgRepo) CheckSlug(ctx context.Context, orgID, slug string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1 AND slug = $2)",
		orgID, slug,
	).Scan(&exists)
	return exists, err
}

// SeedSystemRoles inserts the standard system roles for an org using ON CONFLICT DO NOTHING
// so it is safe to call multiple times.
func (r *OrgRepo) SeedSystemRoles(ctx context.Context, orgID string) error {
	type roleSpec struct {
		name        string
		permissions []string
	}

	roles := []roleSpec{
		{
			name: "org_admin",
			permissions: []string{
				"org:manage", "users:read", "users:write",
				"schools:read", "schools:write",
				"students:read", "students:write",
				"drivers:read", "drivers:write",
				"vehicles:read", "vehicles:write",
				"routes:read", "routes:write",
				"trips:read", "reports:read",
			},
		},
		{
			name: "school_admin",
			permissions: []string{
				"schools:read",
				"students:read", "students:write",
				"guardians:read", "guardians:write",
				"routes:read", "trips:read",
			},
		},
		{
			name:        "driver",
			permissions: []string{"trips:read"},
		},
	}

	for _, role := range roles {
		permsJSON, err := json.Marshal(role.permissions)
		if err != nil {
			return fmt.Errorf("seed system roles: marshal permissions for %s: %w", role.name, err)
		}
		_, err = r.pool.Exec(ctx, `
			INSERT INTO org_roles (id, org_id, name, permissions, is_system)
			VALUES (gen_random_uuid(), $1, $2, $3, true)
			ON CONFLICT (org_id, name) DO NOTHING
		`, orgID, role.name, permsJSON)
		if err != nil {
			return fmt.Errorf("seed system roles: insert %s: %w", role.name, err)
		}
	}
	return nil
}
