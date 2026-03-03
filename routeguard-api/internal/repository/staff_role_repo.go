package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// StaffRoleRepo handles queries for staff_roles and staff_user_roles.
type StaffRoleRepo struct {
	pool *pgxpool.Pool
}

// NewStaffRoleRepo creates a new StaffRoleRepo.
func NewStaffRoleRepo(pool *pgxpool.Pool) *StaffRoleRepo {
	return &StaffRoleRepo{pool: pool}
}

// GetStaffUserPermissions returns the flat list of permission strings for a staff user
// by joining staff_user_roles -> staff_roles -> permissions[].
func (r *StaffRoleRepo) GetStaffUserPermissions(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT unnest(sr.permissions)
		FROM staff_user_roles sur
		JOIN staff_roles sr ON sr.id = sur.role_id
		WHERE sur.user_id = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("get staff permissions: %w", err)
	}
	defer rows.Close()

	permissions := make([]string, 0)
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		permissions = append(permissions, p)
	}
	return permissions, rows.Err()
}

// ListStaffRoles returns all staff roles.
func (r *StaffRoleRepo) ListStaffRoles(ctx context.Context) ([]domain.StaffRole, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, permissions, is_system, created_at
		FROM staff_roles ORDER BY name
	`)
	if err != nil {
		return nil, fmt.Errorf("list staff roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.StaffRole
	for rows.Next() {
		var role domain.StaffRole
		if err := rows.Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// GetStaffRole returns a single staff role by ID.
func (r *StaffRoleRepo) GetStaffRole(ctx context.Context, id string) (*domain.StaffRole, error) {
	var role domain.StaffRole
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, permissions, is_system, created_at
		FROM staff_roles WHERE id = $1
	`, id).Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// CreateStaffRole inserts a new non-system staff role.
func (r *StaffRoleRepo) CreateStaffRole(ctx context.Context, name string, permissions []string) (*domain.StaffRole, error) {
	var role domain.StaffRole
	err := r.pool.QueryRow(ctx, `
		INSERT INTO staff_roles (name, permissions, is_system)
		VALUES ($1, $2, false)
		RETURNING id, name, permissions, is_system, created_at
	`, name, permissions).Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create staff role: %w", err)
	}
	return &role, nil
}

// UpdateStaffRole updates the name and permissions of a non-system staff role.
// Returns an error if the role is a system role.
func (r *StaffRoleRepo) UpdateStaffRole(ctx context.Context, id, name string, permissions []string) (*domain.StaffRole, error) {
	var role domain.StaffRole
	err := r.pool.QueryRow(ctx, `
		UPDATE staff_roles
		SET name = $1, permissions = $2
		WHERE id = $3 AND is_system = false
		RETURNING id, name, permissions, is_system, created_at
	`, name, permissions, id).Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update staff role: %w", err)
	}
	return &role, nil
}

// DeleteStaffRole deletes a non-system staff role.
// Returns pgx.ErrNoRows if the role is a system role or does not exist.
func (r *StaffRoleRepo) DeleteStaffRole(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		"DELETE FROM staff_roles WHERE id = $1 AND is_system = false", id)
	if err != nil {
		return fmt.Errorf("delete staff role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("role not found or is a system role")
	}
	return nil
}

// ListUserStaffRoles returns all staff roles assigned to a user.
func (r *StaffRoleRepo) ListUserStaffRoles(ctx context.Context, userID string) ([]domain.StaffRole, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT sr.id, sr.name, sr.permissions, sr.is_system, sr.created_at
		FROM staff_user_roles sur
		JOIN staff_roles sr ON sr.id = sur.role_id
		WHERE sur.user_id = $1
		ORDER BY sr.name
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list user staff roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.StaffRole
	for rows.Next() {
		var role domain.StaffRole
		if err := rows.Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// AssignStaffRole assigns a role to a staff user. No-op if already assigned.
func (r *StaffRoleRepo) AssignStaffRole(ctx context.Context, userID, roleID string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO staff_user_roles (user_id, role_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, roleID)
	return err
}

// UnassignStaffRole removes a role from a staff user.
func (r *StaffRoleRepo) UnassignStaffRole(ctx context.Context, userID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		"DELETE FROM staff_user_roles WHERE user_id = $1 AND role_id = $2", userID, roleID)
	return err
}
