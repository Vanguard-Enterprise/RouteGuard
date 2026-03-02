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

// TripRepo handles trip queries.
type TripRepo struct {
	pool *pgxpool.Pool
}

// NewTripRepo creates a new TripRepo.
func NewTripRepo(pool *pgxpool.Pool) *TripRepo {
	return &TripRepo{pool: pool}
}

const tripSelectCols = `
	id, route_assignment_id, org_id, date, status, started_at, completed_at,
	notes, created_at
`

func scanTrip(row pgx.Row) (*domain.Trip, error) {
	var t domain.Trip
	if err := row.Scan(
		&t.ID, &t.RouteAssignmentID, &t.OrgID, &t.Date, &t.Status,
		&t.StartedAt, &t.CompletedAt, &t.Notes, &t.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &t, nil
}

// List returns a paginated list of trips for the given org, with optional filters.
// Order: date DESC, created_at DESC.
func (r *TripRepo) List(ctx context.Context, orgID string, limit, offset int, status, date *string) ([]domain.Trip, error) {
	args := []any{orgID}
	conditions := []string{"org_id = $1"}

	if status != nil {
		args = append(args, *status)
		conditions = append(conditions, fmt.Sprintf("status = $%d", len(args)))
	}

	if date != nil {
		t, err := time.Parse("2006-01-02", *date)
		if err != nil {
			return nil, fmt.Errorf("trip list: invalid date filter: %w", err)
		}
		d := pgtype.Date{Time: t, Valid: true}
		args = append(args, d)
		conditions = append(conditions, fmt.Sprintf("date = $%d", len(args)))
	}

	args = append(args, limit)
	limitParam := fmt.Sprintf("$%d", len(args))
	args = append(args, offset)
	offsetParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		SELECT `+tripSelectCols+`
		FROM trips
		WHERE %s
		ORDER BY date DESC, created_at DESC
		LIMIT %s OFFSET %s
	`, strings.Join(conditions, " AND "), limitParam, offsetParam)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("trip list: %w", err)
	}
	defer rows.Close()

	trips := make([]domain.Trip, 0)
	for rows.Next() {
		var t domain.Trip
		if err := rows.Scan(
			&t.ID, &t.RouteAssignmentID, &t.OrgID, &t.Date, &t.Status,
			&t.StartedAt, &t.CompletedAt, &t.Notes, &t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("trip list: %w", err)
		}
		trips = append(trips, t)
	}
	return trips, rows.Err()
}

// Get returns a trip by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *TripRepo) Get(ctx context.Context, id, orgID string) (*domain.Trip, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+tripSelectCols+`
		FROM trips
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	t, err := scanTrip(row)
	if err != nil {
		return nil, err
	}
	return t, nil
}

// Create inserts a new trip, verifying atomically that the route_assignment belongs to the org.
// Returns pgx.ErrNoRows if route_assignment not found or belongs to a different org.
func (r *TripRepo) Create(ctx context.Context, orgID, routeAssignmentID string, date pgtype.Date) (*domain.Trip, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO trips (id, route_assignment_id, org_id, date)
		SELECT gen_random_uuid(), ra.id, $3, $2
		FROM route_assignments ra
		JOIN routes r ON r.id = ra.route_id
		WHERE ra.id = $1 AND r.org_id = $3
		RETURNING `+tripSelectCols,
		routeAssignmentID, date, orgID,
	)
	t, err := scanTrip(row)
	if err != nil {
		return nil, fmt.Errorf("trip create: %w", err)
	}
	return t, nil
}

// Update applies a partial update to a trip scoped to orgID.
// Only status and notes are updatable. Returns the current trip via Get if no fields provided.
func (r *TripRepo) Update(ctx context.Context, id, orgID string, status, notes *string) (*domain.Trip, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if status != nil {
		args = append(args, *status)
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", len(args)))
	}
	if notes != nil {
		args = append(args, *notes)
		setClauses = append(setClauses, fmt.Sprintf("notes = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id, orgID)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE trips
		SET %s
		WHERE id = %s AND org_id = %s
		RETURNING `+tripSelectCols,
		strings.Join(setClauses, ", "), idParam, orgParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	t, err := scanTrip(row)
	if err != nil {
		return nil, fmt.Errorf("trip update: %w", err)
	}
	return t, nil
}
