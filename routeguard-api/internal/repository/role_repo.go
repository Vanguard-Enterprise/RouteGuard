package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type RoleRepo struct {
	pool *pgxpool.Pool
}

func NewRoleRepo(pool *pgxpool.Pool) *RoleRepo {
	return &RoleRepo{pool: pool}
}

func (r *RoleRepo) Create(ctx context.Context, orgID, name string, permissions []string) (*domain.OrgRole, error) {
	var role domain.OrgRole
	err := r.pool.QueryRow(ctx,
		`INSERT INTO org_roles (org_id, name, permissions)
		 VALUES ($1, $2, $3)
		 RETURNING id, org_id, name, permissions, is_system, created_at`,
		orgID, name, permissions,
	).Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create role: %w", err)
	}
	return &role, nil
}

func (r *RoleRepo) GetByID(ctx context.Context, id string) (*domain.OrgRole, error) {
	var role domain.OrgRole
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, name, permissions, is_system, created_at
		 FROM org_roles WHERE id = $1`, id,
	).Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get role: %w", err)
	}
	return &role, nil
}

func (r *RoleRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.OrgRole, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, name, permissions, is_system, created_at
		 FROM org_roles WHERE org_id = $1 ORDER BY is_system DESC, name`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.OrgRole
	for rows.Next() {
		var role domain.OrgRole
		if err := rows.Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, nil
}

func (r *RoleRepo) Update(ctx context.Context, id, name string, permissions []string) (*domain.OrgRole, error) {
	var role domain.OrgRole
	err := r.pool.QueryRow(ctx,
		`UPDATE org_roles SET name = $2, permissions = $3
		 WHERE id = $1 AND is_system = false
		 RETURNING id, org_id, name, permissions, is_system, created_at`,
		id, name, permissions,
	).Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update role: %w", err)
	}
	return &role, nil
}

func (r *RoleRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM org_roles WHERE id = $1 AND is_system = false`, id)
	if err != nil {
		return fmt.Errorf("delete role: %w", err)
	}
	return nil
}

func (r *RoleRepo) AssignToMember(ctx context.Context, membershipID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO org_member_roles (membership_id, role_id)
		 VALUES ($1, $2)
		 ON CONFLICT (membership_id, role_id) DO NOTHING`,
		membershipID, roleID,
	)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	return nil
}

func (r *RoleRepo) UnassignFromMember(ctx context.Context, membershipID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM org_member_roles WHERE membership_id = $1 AND role_id = $2`,
		membershipID, roleID,
	)
	if err != nil {
		return fmt.Errorf("unassign role: %w", err)
	}
	return nil
}

func (r *RoleRepo) ListMemberRoles(ctx context.Context, membershipID string) ([]domain.OrgRole, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT r.id, r.org_id, r.name, r.permissions, r.is_system, r.created_at
		 FROM org_roles r
		 JOIN org_member_roles mr ON mr.role_id = r.id
		 WHERE mr.membership_id = $1
		 ORDER BY r.name`, membershipID,
	)
	if err != nil {
		return nil, fmt.Errorf("list member roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.OrgRole
	for rows.Next() {
		var role domain.OrgRole
		if err := rows.Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, nil
}
