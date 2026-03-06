package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type MembershipRepo struct {
	pool *pgxpool.Pool
}

func NewMembershipRepo(pool *pgxpool.Pool) *MembershipRepo {
	return &MembershipRepo{pool: pool}
}

func (r *MembershipRepo) Create(ctx context.Context, userID, orgID string) (*domain.OrgMembership, error) {
	var m domain.OrgMembership
	err := r.pool.QueryRow(ctx,
		`INSERT INTO org_memberships (user_id, org_id)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, org_id) DO UPDATE SET user_id = EXCLUDED.user_id
		 RETURNING id, user_id, org_id, created_at`,
		userID, orgID,
	).Scan(&m.ID, &m.UserID, &m.OrgID, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create membership: %w", err)
	}
	return &m, nil
}

func (r *MembershipRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM org_memberships WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete membership: %w", err)
	}
	return nil
}

func (r *MembershipRepo) GetByUserAndOrg(ctx context.Context, userID, orgID string) (*domain.OrgMembership, error) {
	var m domain.OrgMembership
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, org_id, created_at
		 FROM org_memberships WHERE user_id = $1 AND org_id = $2`,
		userID, orgID,
	).Scan(&m.ID, &m.UserID, &m.OrgID, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get membership: %w", err)
	}
	return &m, nil
}

// ListOrgsByUser returns all orgs for a user. The caller must decrypt NameEnc.
func (r *MembershipRepo) ListOrgsByUser(ctx context.Context, userID string) ([]domain.Organization, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT o.id, o.name_enc, o.slug, o.is_platform, o.created_at, o.updated_at
		 FROM organizations o
		 JOIN org_memberships m ON m.org_id = o.id
		 WHERE m.user_id = $1
		 ORDER BY o.created_at`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list orgs by user: %w", err)
	}
	defer rows.Close()

	var orgs []domain.Organization
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan org: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, nil
}

// ListMembersByOrg returns all user memberships for an org.
func (r *MembershipRepo) ListMembersByOrg(ctx context.Context, orgID string) ([]domain.OrgMembership, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, org_id, created_at
		 FROM org_memberships WHERE org_id = $1
		 ORDER BY created_at`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list members by org: %w", err)
	}
	defer rows.Close()

	var members []domain.OrgMembership
	for rows.Next() {
		var m domain.OrgMembership
		if err := rows.Scan(&m.ID, &m.UserID, &m.OrgID, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan membership: %w", err)
		}
		members = append(members, m)
	}
	return members, nil
}

// GetUserPermissions returns all permission strings for a user in an org
// by joining through membership -> member_roles -> roles.
func (r *MembershipRepo) GetUserPermissions(ctx context.Context, userID, orgID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT unnest(r.permissions)
		 FROM org_roles r
		 JOIN org_member_roles mr ON mr.role_id = r.id
		 JOIN org_memberships m ON m.id = mr.membership_id
		 WHERE m.user_id = $1 AND m.org_id = $2`,
		userID, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("get user permissions: %w", err)
	}
	defer rows.Close()

	var perms []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		perms = append(perms, p)
	}
	return perms, nil
}
