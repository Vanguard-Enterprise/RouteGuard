package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type DemoResetRepo struct {
	pool *pgxpool.Pool
}

func NewDemoResetRepo(pool *pgxpool.Pool) *DemoResetRepo {
	return &DemoResetRepo{pool: pool}
}

func (r *DemoResetRepo) Create(ctx context.Context, run domain.DemoResetRun) (*domain.DemoResetRun, error) {
	var out domain.DemoResetRun
	err := r.pool.QueryRow(ctx,
		`INSERT INTO demo_reset_runs (org_id, template_version, reset_mode, status, started_by_user_id, started_by_email)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, org_id, template_version, reset_mode, status, started_by_user_id, started_by_email, started_at, completed_at, last_error`,
		run.OrgID, run.TemplateVersion, run.ResetMode, run.Status, run.StartedByUserID, run.StartedByEmail,
	).Scan(
		&out.ID, &out.OrgID, &out.TemplateVersion, &out.ResetMode, &out.Status,
		&out.StartedByUserID, &out.StartedByEmail, &out.StartedAt, &out.CompletedAt, &out.LastError,
	)
	if err != nil {
		return nil, fmt.Errorf("create demo reset run: %w", err)
	}
	return &out, nil
}

func (r *DemoResetRepo) Complete(ctx context.Context, id string, status string, lastError *string) (*domain.DemoResetRun, error) {
	var out domain.DemoResetRun
	err := r.pool.QueryRow(ctx,
		`UPDATE demo_reset_runs
		 SET status = $2, completed_at = now(), last_error = $3
		 WHERE id = $1
		 RETURNING id, org_id, template_version, reset_mode, status, started_by_user_id, started_by_email, started_at, completed_at, last_error`,
		id, status, lastError,
	).Scan(
		&out.ID, &out.OrgID, &out.TemplateVersion, &out.ResetMode, &out.Status,
		&out.StartedByUserID, &out.StartedByEmail, &out.StartedAt, &out.CompletedAt, &out.LastError,
	)
	if err != nil {
		return nil, fmt.Errorf("complete demo reset run: %w", err)
	}
	return &out, nil
}

func (r *DemoResetRepo) LatestByOrg(ctx context.Context, orgID string) (*domain.DemoResetRun, error) {
	var out domain.DemoResetRun
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, template_version, reset_mode, status, started_by_user_id, started_by_email, started_at, completed_at, last_error
		 FROM demo_reset_runs
		 WHERE org_id = $1
		 ORDER BY started_at DESC
		 LIMIT 1`,
		orgID,
	).Scan(
		&out.ID, &out.OrgID, &out.TemplateVersion, &out.ResetMode, &out.Status,
		&out.StartedByUserID, &out.StartedByEmail, &out.StartedAt, &out.CompletedAt, &out.LastError,
	)
	if err != nil {
		return nil, fmt.Errorf("latest demo reset run: %w", err)
	}
	return &out, nil
}
