package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// ReportRepo handles daily_summaries queries.
type ReportRepo struct {
	pool *pgxpool.Pool
}

// NewReportRepo creates a new ReportRepo.
func NewReportRepo(pool *pgxpool.Pool) *ReportRepo {
	return &ReportRepo{pool: pool}
}

const summarySelectCols = `
	id, org_id, route_id, date, total_students, boarded_count, on_time, delay_minutes, notes, created_at
`

func scanSummary(row pgx.Row) (*domain.DailySummary, error) {
	var s domain.DailySummary
	if err := row.Scan(
		&s.ID, &s.OrgID, &s.RouteID, &s.Date, &s.TotalStudents,
		&s.BoardedCount, &s.OnTime, &s.DelayMinutes, &s.Notes, &s.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}

// ListSummaries returns a paginated list of daily summaries for the given org.
// Optional filters: routeID, dateFrom, dateTo (ISO-8601 YYYY-MM-DD).
// Order: date DESC, route_id.
func (r *ReportRepo) ListSummaries(ctx context.Context, orgID string, limit, offset int, routeID, dateFrom, dateTo *string) ([]domain.DailySummary, error) {
	args := []any{orgID}
	conditions := []string{"org_id = $1"}

	if routeID != nil {
		args = append(args, *routeID)
		conditions = append(conditions, fmt.Sprintf("route_id = $%d", len(args)))
	}

	if dateFrom != nil {
		t, err := time.Parse("2006-01-02", *dateFrom)
		if err != nil {
			return nil, fmt.Errorf("report list: invalid date_from filter: %w", err)
		}
		d := pgtype.Date{Time: t, Valid: true}
		args = append(args, d)
		conditions = append(conditions, fmt.Sprintf("date >= $%d", len(args)))
	}

	if dateTo != nil {
		t, err := time.Parse("2006-01-02", *dateTo)
		if err != nil {
			return nil, fmt.Errorf("report list: invalid date_to filter: %w", err)
		}
		d := pgtype.Date{Time: t, Valid: true}
		args = append(args, d)
		conditions = append(conditions, fmt.Sprintf("date <= $%d", len(args)))
	}

	args = append(args, limit)
	limitParam := fmt.Sprintf("$%d", len(args))
	args = append(args, offset)
	offsetParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		SELECT `+summarySelectCols+`
		FROM daily_summaries
		WHERE %s
		ORDER BY date DESC, route_id
		LIMIT %s OFFSET %s
	`, strings.Join(conditions, " AND "), limitParam, offsetParam)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("report list: %w", err)
	}
	defer rows.Close()

	summaries := make([]domain.DailySummary, 0)
	for rows.Next() {
		var s domain.DailySummary
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.RouteID, &s.Date, &s.TotalStudents,
			&s.BoardedCount, &s.OnTime, &s.DelayMinutes, &s.Notes, &s.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("report list: %w", err)
		}
		summaries = append(summaries, s)
	}
	return summaries, rows.Err()
}

// GetSummary returns a daily summary by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *ReportRepo) GetSummary(ctx context.Context, id, orgID string) (*domain.DailySummary, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+summarySelectCols+`
		FROM daily_summaries
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	s, err := scanSummary(row)
	if err != nil {
		return nil, fmt.Errorf("report get: %w", err)
	}
	return s, nil
}

// UpsertSummary inserts or updates a daily summary for the given org/route/date combination.
// On conflict (org_id, route_id, date), updates the mutable fields.
func (r *ReportRepo) UpsertSummary(
	ctx context.Context,
	orgID, routeID string,
	date pgtype.Date,
	totalStudents, boardedCount int,
	onTime bool,
	delayMinutes *int,
	notes *string,
) (*domain.DailySummary, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO daily_summaries (org_id, route_id, date, total_students, boarded_count, on_time, delay_minutes, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (org_id, route_id, date) DO UPDATE SET
			total_students = EXCLUDED.total_students,
			boarded_count  = EXCLUDED.boarded_count,
			on_time        = EXCLUDED.on_time,
			delay_minutes  = EXCLUDED.delay_minutes,
			notes          = EXCLUDED.notes
		RETURNING `+summarySelectCols,
		orgID, routeID, date, totalStudents, boardedCount, onTime, delayMinutes, notes,
	)
	s, err := scanSummary(row)
	if err != nil {
		return nil, fmt.Errorf("report upsert: %w", err)
	}
	return s, nil
}
