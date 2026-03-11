package repository

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) Create(ctx context.Context, emailEnc, emailHash, nameEnc string, passwordHash *string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email_enc, email_hash, name_enc, password_hash)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email_enc, email_hash, name_enc, password_hash, disabled_at, last_login_at, created_at, updated_at`,
		emailEnc, emailHash, nameEnc, passwordHash,
	).Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.PasswordHash, &u.DisabledAt, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email_enc, email_hash, name_enc, password_hash, disabled_at, last_login_at, created_at, updated_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.PasswordHash, &u.DisabledAt, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

// IsUserEnabled returns true if the user exists and is not disabled.
func (r *UserRepo) IsUserEnabled(ctx context.Context, id string) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND disabled_at IS NULL)`,
		id,
	).Scan(&enabled)
	return enabled, err
}

func (r *UserRepo) GetByEmailHash(ctx context.Context, emailHash string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email_enc, email_hash, name_enc, password_hash, disabled_at, last_login_at, created_at, updated_at
		 FROM users WHERE email_hash = $1`, emailHash,
	).Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.PasswordHash, &u.DisabledAt, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by email hash: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) ListPaginated(ctx context.Context, emailHash string, page, perPage int) ([]domain.User, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	countQuery := `SELECT COUNT(*) FROM users`
	args := []any{}
	argIdx := 1
	if emailHash != "" {
		countQuery += ` WHERE email_hash = $` + strconv.Itoa(argIdx)
		args = append(args, emailHash)
		argIdx++
	}

	var total int
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	dataQuery := `SELECT id, email_enc, email_hash, name_enc, disabled_at, last_login_at, created_at, updated_at
	              FROM users`
	dataArgs := []any{}
	dataIdx := 1
	if emailHash != "" {
		dataQuery += ` WHERE email_hash = $` + strconv.Itoa(dataIdx)
		dataArgs = append(dataArgs, emailHash)
		dataIdx++
	}
	dataQuery += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(dataIdx) + ` OFFSET $` + strconv.Itoa(dataIdx+1)
	dataArgs = append(dataArgs, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.DisabledAt, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, 0, err
		}
		items = append(items, u)
	}

	return items, total, nil
}

func (r *UserRepo) Disable(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET disabled_at = now(), updated_at = now() WHERE id = $1 AND disabled_at IS NULL`,
		id,
	)
	return err
}

func (r *UserRepo) Enable(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET disabled_at = NULL, updated_at = now() WHERE id = $1 AND disabled_at IS NOT NULL`,
		id,
	)
	return err
}
