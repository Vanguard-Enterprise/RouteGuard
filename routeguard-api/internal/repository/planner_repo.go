package repository

import (
	"context"
	"fmt"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type PlannerRepo struct {
	pool *pgxpool.Pool
}

func NewPlannerRepo(pool *pgxpool.Pool) *PlannerRepo {
	return &PlannerRepo{pool: pool}
}

func (r *PlannerRepo) CreateRun(ctx context.Context, run *domain.PlannerRun) (*domain.PlannerRun, error) {
	var out domain.PlannerRun
	err := r.pool.QueryRow(ctx,
		`INSERT INTO planner_runs (org_id, mode, service_window, status, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, org_id, mode, service_window, status, created_by, created_at, published_at`,
		run.OrgID, run.Mode, run.ServiceWindow, run.Status, run.CreatedBy,
	).Scan(&out.ID, &out.OrgID, &out.Mode, &out.ServiceWindow, &out.Status, &out.CreatedBy, &out.CreatedAt, &out.PublishedAt)
	if err != nil {
		return nil, fmt.Errorf("create planner run: %w", err)
	}
	return &out, nil
}

func (r *PlannerRepo) GetByID(ctx context.Context, orgID, id string) (*domain.PlannerRun, error) {
	var run domain.PlannerRun
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, mode, service_window, status, created_by, created_at, published_at
		 FROM planner_runs
		 WHERE id = $1 AND org_id = $2`,
		id, orgID,
	).Scan(&run.ID, &run.OrgID, &run.Mode, &run.ServiceWindow, &run.Status, &run.CreatedBy, &run.CreatedAt, &run.PublishedAt)
	if err != nil {
		return nil, fmt.Errorf("get planner run: %w", err)
	}
	return &run, nil
}

func (r *PlannerRepo) ListByOrg(ctx context.Context, orgID string, page, perPage int) ([]domain.PlannerRun, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM planner_runs WHERE org_id = $1`, orgID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count planner runs: %w", err)
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, mode, service_window, status, created_by, created_at, published_at
		 FROM planner_runs
		 WHERE org_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		orgID, perPage, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list planner runs: %w", err)
	}
	defer rows.Close()

	items := make([]domain.PlannerRun, 0)
	for rows.Next() {
		var run domain.PlannerRun
		if err := rows.Scan(&run.ID, &run.OrgID, &run.Mode, &run.ServiceWindow, &run.Status, &run.CreatedBy, &run.CreatedAt, &run.PublishedAt); err != nil {
			return nil, 0, fmt.Errorf("scan planner run: %w", err)
		}
		items = append(items, run)
	}
	return items, total, nil
}

func (r *PlannerRepo) PublishRun(ctx context.Context, orgID, id string) (*domain.PlannerRun, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`UPDATE planner_runs
		 SET status = 'published', published_at = now()
		 WHERE id = $1 AND org_id = $2`,
		id, orgID,
	); err != nil {
		return nil, fmt.Errorf("publish planner run: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE routes
		 SET status = 'active', updated_at = now()
		 WHERE org_id = $1 AND planner_run_id = $2 AND deleted_at IS NULL`,
		orgID, id,
	); err != nil {
		return nil, fmt.Errorf("activate routes: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE route_assignments ra
		 SET is_active = false, ended_at = now()
		 FROM routes r
		 WHERE ra.route_id = r.id AND r.org_id = $1 AND r.planner_run_id <> $2 AND ra.is_active = true`,
		orgID, id,
	); err != nil {
		return nil, fmt.Errorf("close old assignments: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO route_assignments (org_id, route_id, driver_id, vehicle_id, is_active)
		 SELECT r.org_id, r.id, r.driver_id, r.vehicle_id, true
		 FROM routes r
		 WHERE r.org_id = $1 AND r.planner_run_id = $2 AND r.driver_id IS NOT NULL AND r.vehicle_id IS NOT NULL
		 ON CONFLICT DO NOTHING`,
		orgID, id,
	); err != nil {
		return nil, fmt.Errorf("create route assignments: %w", err)
	}

	var out domain.PlannerRun
	if err := tx.QueryRow(ctx,
		`SELECT id, org_id, mode, service_window, status, created_by, created_at, published_at
		 FROM planner_runs
		 WHERE id = $1 AND org_id = $2`,
		id, orgID,
	).Scan(&out.ID, &out.OrgID, &out.Mode, &out.ServiceWindow, &out.Status, &out.CreatedBy, &out.CreatedAt, &out.PublishedAt); err != nil {
		return nil, fmt.Errorf("load planner run: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit publish: %w", err)
	}
	return &out, nil
}

func (r *PlannerRepo) ListIssues(ctx context.Context, runID string) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, issue_type, severity, message, metadata, created_at
		 FROM planner_run_issues
		 WHERE planner_run_id = $1
		 ORDER BY created_at ASC`,
		runID,
	)
	if err != nil {
		return nil, fmt.Errorf("list planner run issues: %w", err)
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, issueType, severity, message string
		var metadata []byte
		var createdAt string
		if err := rows.Scan(&id, &issueType, &severity, &message, &metadata, &createdAt); err != nil {
			return nil, fmt.Errorf("scan planner issue: %w", err)
		}
		items = append(items, map[string]any{
			"id": id,
			"issue_type": issueType,
			"severity": severity,
			"message": message,
			"metadata": string(metadata),
			"created_at": createdAt,
		})
	}
	return items, nil
}

func BuildRouteCode(runCreatedAtUnix int64, idx int) string {
	return "PM-" + strconv.FormatInt(runCreatedAtUnix, 10) + "-" + strconv.Itoa(idx+1)
}
