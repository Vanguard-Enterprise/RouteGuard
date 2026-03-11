package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type OrgRepo struct {
	pool *pgxpool.Pool
}

func NewOrgRepo(pool *pgxpool.Pool) *OrgRepo {
	return &OrgRepo{pool: pool}
}

func (r *OrgRepo) Create(ctx context.Context, nameEnc, slug string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`INSERT INTO organizations (name_enc, slug)
		 VALUES ($1, $2)
		 RETURNING id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at`,
		nameEnc, slug,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create org: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) GetByID(ctx context.Context, id string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`SELECT id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at
		 FROM organizations WHERE id = $1`, id,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get org by id: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) GetBySlug(ctx context.Context, slug string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`SELECT id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at
		 FROM organizations WHERE slug = $1`, slug,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get org by slug: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) List(ctx context.Context) ([]domain.Organization, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at
		 FROM organizations ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("list orgs: %w", err)
	}
	defer rows.Close()

	var orgs []domain.Organization
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan org: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, nil
}

func (r *OrgRepo) Update(ctx context.Context, id, nameEnc, slug string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`UPDATE organizations SET name_enc = $2, slug = $3, updated_at = now()
		 WHERE id = $1
		 RETURNING id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at`,
		id, nameEnc, slug,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update org: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1 AND is_platform = false`, id)
	if err != nil {
		return fmt.Errorf("delete org: %w", err)
	}
	return nil
}

// IsOrgAccessible returns true if the org exists and is neither suspended nor deleted.
func (r *OrgRepo) IsOrgAccessible(ctx context.Context, id string) (bool, error) {
	var accessible bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1 AND suspended_at IS NULL AND deleted_at IS NULL)`,
		id,
	).Scan(&accessible)
	return accessible, err
}

// SeedSystemRoles creates the default Owner and Member roles for a new org.
func (r *OrgRepo) SeedSystemRoles(ctx context.Context, orgID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO org_roles (org_id, name, permissions, is_system) VALUES
		 ($1, 'Owner', ARRAY['org:manage', 'members:read', 'members:write', 'roles:read', 'roles:write', 'sso:read', 'sso:write'], true),
		 ($1, 'Member', ARRAY['members:read'], true)`,
		orgID,
	)
	if err != nil {
		return fmt.Errorf("seed system roles: %w", err)
	}
	return nil
}
