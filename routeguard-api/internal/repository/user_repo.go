package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// UserRepo handles user and identity queries.
type UserRepo struct {
	pool *pgxpool.Pool
}

// NewUserRepo creates a new UserRepo.
func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

// FindByEmailAndProvider looks up a user by email and returns their password_hash.
// Returns the user and the password_hash from user_identities.
func (r *UserRepo) FindByEmailAndProvider(ctx context.Context, email, provider string) (*domain.User, string, error) {
	var u domain.User
	var passwordHash string

	row := r.pool.QueryRow(ctx, `
		SELECT u.id, u.org_id, u.email, u.name, u.avatar_url, u.last_login_at, u.created_at,
		       ui.password_hash
		FROM users u
		JOIN user_identities ui ON ui.user_id = u.id
		WHERE u.email = $1 AND ui.provider = $2
	`, email, provider)

	err := row.Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt,
		&passwordHash,
	)
	if err != nil {
		return nil, "", err
	}
	return &u, passwordHash, nil
}

// FindByID looks up a user by their ID.
func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, created_at
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserPermissions returns the flat list of permission strings for a user
// by joining user_roles → org_roles → permissions[].
func (r *UserRepo) GetUserPermissions(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT unnest(orr.permissions)
		FROM user_roles ur
		JOIN org_roles orr ON orr.id = ur.role_id
		WHERE ur.user_id = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("get user permissions: %w", err)
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

// UpdateLastLogin sets last_login_at to now for the given user.
func (r *UserRepo) UpdateLastLogin(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE users SET last_login_at = NOW() WHERE id = $1", userID)
	return err
}
