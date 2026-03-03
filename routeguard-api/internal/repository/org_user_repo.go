package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

// OrgUserRepo handles user queries scoped to a specific org for admin use.
type OrgUserRepo struct {
	pool *pgxpool.Pool
}

// NewOrgUserRepo creates a new OrgUserRepo.
func NewOrgUserRepo(pool *pgxpool.Pool) *OrgUserRepo {
	return &OrgUserRepo{pool: pool}
}

// ListByOrg returns all users belonging to orgID, ordered by name.
func (r *OrgUserRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users
		WHERE org_id = $1
		ORDER BY name
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("org user list: %w", err)
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(
			&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("org user list scan: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// CreateWithPasswordAndAdminRole creates a new user for the org with a password identity
// and assigns the org's system org_admin role - all in a single transaction.
// Returns the created user. Returns an error if the email already exists in the org
// or if the org has no org_admin system role.
func (r *OrgUserRepo) CreateWithPasswordAndAdminRole(ctx context.Context, orgID, email, name, password string) (*domain.User, error) {
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("create org user: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var u domain.User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (org_id, email, name)
		VALUES ($1, $2, $3)
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, orgID, email, name).Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create org user: insert user: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, password_hash)
		VALUES ($1, 'password', $2)
	`, u.ID, hash)
	if err != nil {
		return nil, fmt.Errorf("create org user: insert identity: %w", err)
	}

	var roleID string
	err = tx.QueryRow(ctx, `
		SELECT id FROM org_roles
		WHERE org_id = $1 AND name = 'org_admin' AND is_system = true
	`, orgID).Scan(&roleID)
	if err != nil {
		return nil, fmt.Errorf("create org user: find org_admin role: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO user_roles (id, user_id, role_id)
		VALUES (gen_random_uuid(), $1, $2)
		ON CONFLICT (user_id, role_id) DO NOTHING
	`, u.ID, roleID)
	if err != nil {
		return nil, fmt.Errorf("create org user: assign role: %w", err)
	}

	return &u, tx.Commit(ctx)
}
