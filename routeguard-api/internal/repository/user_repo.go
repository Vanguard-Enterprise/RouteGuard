package repository

import (
	"context"
	"fmt"

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
