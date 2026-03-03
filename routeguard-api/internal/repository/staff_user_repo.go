package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

// StaffUserRepo handles staff user CRUD including soft/hard delete.
type StaffUserRepo struct {
	pool *pgxpool.Pool
}

// NewStaffUserRepo creates a new StaffUserRepo.
func NewStaffUserRepo(pool *pgxpool.Pool) *StaffUserRepo {
	return &StaffUserRepo{pool: pool}
}

// scanStaffUser scans a staff user row (id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at).
func scanStaffUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ListStaffUsers returns all staff users (org_id IS NULL), including soft-deleted ones.
func (r *StaffUserRepo) ListStaffUsers(ctx context.Context) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users
		WHERE org_id IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list staff users: %w", err)
	}
	defer rows.Close()

	var users []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// GetStaffUser returns a single staff user by ID. Returns pgx.ErrNoRows if not found or not staff.
func (r *StaffUserRepo) GetStaffUser(ctx context.Context, id string) (*domain.User, error) {
	return scanStaffUser(r.pool.QueryRow(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users WHERE id = $1 AND org_id IS NULL
	`, id))
}

// CreateStaffUser creates a new staff user with a password identity.
// Returns the created user.
func (r *StaffUserRepo) CreateStaffUser(ctx context.Context, email, name, password string) (*domain.User, error) {
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("create staff user: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var u domain.User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, name)
		VALUES ($1, $2)
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, email, name).Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create staff user: insert user: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, password_hash)
		VALUES ($1, 'password', $2)
	`, u.ID, hash)
	if err != nil {
		return nil, fmt.Errorf("create staff user: insert identity: %w", err)
	}

	return &u, tx.Commit(ctx)
}

// UpdateStaffUser updates the name of a staff user.
func (r *StaffUserRepo) UpdateStaffUser(ctx context.Context, id, name string) (*domain.User, error) {
	return scanStaffUser(r.pool.QueryRow(ctx, `
		UPDATE users SET name = $1
		WHERE id = $2 AND org_id IS NULL AND deleted_at IS NULL
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, name, id))
}

// SoftDeleteStaffUser sets deleted_at to now for a staff user.
func (r *StaffUserRepo) SoftDeleteStaffUser(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		"UPDATE users SET deleted_at = NOW() WHERE id = $1 AND org_id IS NULL AND deleted_at IS NULL",
		id)
	if err != nil {
		return fmt.Errorf("soft delete staff user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// RestoreStaffUser clears deleted_at for a staff user within the 30-day window.
func (r *StaffUserRepo) RestoreStaffUser(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		"UPDATE users SET deleted_at = NULL WHERE id = $1 AND org_id IS NULL AND deleted_at IS NOT NULL",
		id)
	if err != nil {
		return fmt.Errorf("restore staff user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// HardDeleteExpiredStaffUsers permanently deletes staff users soft-deleted more than 30 days ago.
// Returns the number of rows deleted.
func (r *StaffUserRepo) HardDeleteExpiredStaffUsers(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM users
		WHERE org_id IS NULL
		  AND deleted_at IS NOT NULL
		  AND deleted_at < NOW() - INTERVAL '30 days'
	`)
	if err != nil {
		return 0, fmt.Errorf("hard delete expired staff users: %w", err)
	}
	return tag.RowsAffected(), nil
}

// GetExpiredStaffUserIDs returns IDs of staff users eligible for hard delete.
// Used to clean up their Redis session sets before hard deleting.
func (r *StaffUserRepo) GetExpiredStaffUserIDs(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM users
		WHERE org_id IS NULL
		  AND deleted_at IS NOT NULL
		  AND deleted_at < NOW() - INTERVAL '30 days'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// DaysUntilDeletion returns how many days remain before the user is hard-deleted.
// Returns 0 if not soft-deleted.
func DaysUntilDeletion(deletedAt *time.Time) int {
	if deletedAt == nil {
		return 0
	}
	remaining := time.Until(deletedAt.Add(30 * 24 * time.Hour))
	if remaining <= 0 {
		return 0
	}
	return int(remaining.Hours()/24) + 1
}
