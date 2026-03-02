package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// RouteRepo handles route, stop, and route assignment queries.
type RouteRepo struct {
	pool *pgxpool.Pool
}

// NewRouteRepo creates a new RouteRepo.
func NewRouteRepo(pool *pgxpool.Pool) *RouteRepo {
	return &RouteRepo{pool: pool}
}

const routeSelectCols = `
	id, org_id, name, type, status, description, estimated_duration_min,
	created_at, updated_at
`

const stopSelectCols = `
	id, route_id, name, address, lat, lng, sequence_order, scheduled_time,
	created_at, updated_at
`

const routeAssignmentSelectCols = `
	id, route_id, vehicle_id, driver_id, effective_date, end_date, days_of_week,
	created_at
`

func scanRoute(row pgx.Row) (*domain.Route, error) {
	var rt domain.Route
	err := row.Scan(
		&rt.ID, &rt.OrgID, &rt.Name, &rt.Type, &rt.Status,
		&rt.Description, &rt.EstimatedDurationMin,
		&rt.CreatedAt, &rt.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rt, nil
}

func scanStop(row pgx.Row) (*domain.Stop, error) {
	var s domain.Stop
	err := row.Scan(
		&s.ID, &s.RouteID, &s.Name, &s.Address, &s.Lat, &s.Lng,
		&s.SequenceOrder, &s.ScheduledTime,
		&s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func scanRouteAssignment(row pgx.Row) (*domain.RouteAssignment, error) {
	var ra domain.RouteAssignment
	err := row.Scan(
		&ra.ID, &ra.RouteID, &ra.VehicleID, &ra.DriverID,
		&ra.EffectiveDate, &ra.EndDate, &ra.DaysOfWeek,
		&ra.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &ra, nil
}

// routeBelongsToOrg returns true if the given routeID belongs to orgID.
func (r *RouteRepo) routeBelongsToOrg(ctx context.Context, routeID, orgID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM routes WHERE id = $1 AND org_id = $2)",
		routeID, orgID,
	).Scan(&exists)
	return exists, err
}

// List returns a paginated list of routes for the given org, ordered by name.
func (r *RouteRepo) List(ctx context.Context, orgID string, limit, offset int) ([]domain.Route, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+routeSelectCols+`
		FROM routes
		WHERE org_id = $1
		ORDER BY name
		LIMIT $2 OFFSET $3
	`, orgID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("route list: %w", err)
	}
	defer rows.Close()

	routes := make([]domain.Route, 0)
	for rows.Next() {
		var rt domain.Route
		if err := rows.Scan(
			&rt.ID, &rt.OrgID, &rt.Name, &rt.Type, &rt.Status,
			&rt.Description, &rt.EstimatedDurationMin,
			&rt.CreatedAt, &rt.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("route list scan: %w", err)
		}
		routes = append(routes, rt)
	}
	return routes, rows.Err()
}

// Get returns a route by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *RouteRepo) Get(ctx context.Context, id, orgID string) (*domain.Route, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+routeSelectCols+`
		FROM routes
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	return scanRoute(row)
}

// Create inserts a new route and returns the created row.
func (r *RouteRepo) Create(ctx context.Context, orgID, name, routeType, status string, description *string, estimatedDurationMin *int) (*domain.Route, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO routes (id, org_id, name, type, status, description, estimated_duration_min)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
		RETURNING `+routeSelectCols,
		orgID, name, routeType, status, description, estimatedDurationMin,
	)
	rt, err := scanRoute(row)
	if err != nil {
		return nil, fmt.Errorf("route create: %w", err)
	}
	return rt, nil
}

// Update applies a partial update to a route scoped to orgID. Only non-nil fields are updated.
// If no fields are provided, returns the current route via Get.
func (r *RouteRepo) Update(ctx context.Context, id, orgID string, name, routeType, status, description *string, estimatedDurationMin *int) (*domain.Route, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if name != nil {
		args = append(args, *name)
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", len(args)))
	}
	if routeType != nil {
		args = append(args, *routeType)
		setClauses = append(setClauses, fmt.Sprintf("type = $%d", len(args)))
	}
	if status != nil {
		args = append(args, *status)
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", len(args)))
	}
	if description != nil {
		args = append(args, *description)
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", len(args)))
	}
	if estimatedDurationMin != nil {
		args = append(args, *estimatedDurationMin)
		setClauses = append(setClauses, fmt.Sprintf("estimated_duration_min = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id, orgID)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE routes
		SET %s, updated_at = NOW()
		WHERE id = %s AND org_id = %s
		RETURNING `+routeSelectCols,
		strings.Join(setClauses, ", "), idParam, orgParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	rt, err := scanRoute(row)
	if err != nil {
		return nil, fmt.Errorf("route update: %w", err)
	}
	return rt, nil
}

// Delete hard-deletes a route by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *RouteRepo) Delete(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM routes WHERE id = $1 AND org_id = $2", id, orgID)
	if err != nil {
		return fmt.Errorf("route delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ListStops returns all stops for a route, ordered by sequence_order.
// Returns pgx.ErrNoRows if the route does not belong to orgID.
func (r *RouteRepo) ListStops(ctx context.Context, routeID, orgID string) ([]domain.Stop, error) {
	ok, err := r.routeBelongsToOrg(ctx, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("stop list org check: %w", err)
	}
	if !ok {
		return nil, pgx.ErrNoRows
	}

	rows, err := r.pool.Query(ctx, `
		SELECT `+stopSelectCols+`
		FROM stops
		WHERE route_id = $1
		ORDER BY sequence_order
	`, routeID)
	if err != nil {
		return nil, fmt.Errorf("stop list: %w", err)
	}
	defer rows.Close()

	stops := make([]domain.Stop, 0)
	for rows.Next() {
		var s domain.Stop
		if err := rows.Scan(
			&s.ID, &s.RouteID, &s.Name, &s.Address, &s.Lat, &s.Lng,
			&s.SequenceOrder, &s.ScheduledTime,
			&s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("stop list scan: %w", err)
		}
		stops = append(stops, s)
	}
	return stops, rows.Err()
}

// CreateStop inserts a new stop on a route. Verifies route belongs to orgID first.
func (r *RouteRepo) CreateStop(ctx context.Context, routeID, orgID, name string, address *string, lat, lng *float64, sequenceOrder int, scheduledTime *string) (*domain.Stop, error) {
	ok, err := r.routeBelongsToOrg(ctx, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("stop create org check: %w", err)
	}
	if !ok {
		return nil, pgx.ErrNoRows
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
		RETURNING `+stopSelectCols,
		routeID, name, address, lat, lng, sequenceOrder, scheduledTime,
	)
	s, err := scanStop(row)
	if err != nil {
		return nil, fmt.Errorf("stop create: %w", err)
	}
	return s, nil
}

// UpdateStop applies a partial update to a stop, verifying org scope via route.
func (r *RouteRepo) UpdateStop(ctx context.Context, stopID, routeID, orgID string, name, address *string, lat, lng *float64, sequenceOrder *int, scheduledTime *string) (*domain.Stop, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if name != nil {
		args = append(args, *name)
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", len(args)))
	}
	if address != nil {
		args = append(args, *address)
		setClauses = append(setClauses, fmt.Sprintf("address = $%d", len(args)))
	}
	if lat != nil {
		args = append(args, *lat)
		setClauses = append(setClauses, fmt.Sprintf("lat = $%d", len(args)))
	}
	if lng != nil {
		args = append(args, *lng)
		setClauses = append(setClauses, fmt.Sprintf("lng = $%d", len(args)))
	}
	if sequenceOrder != nil {
		args = append(args, *sequenceOrder)
		setClauses = append(setClauses, fmt.Sprintf("sequence_order = $%d", len(args)))
	}
	if scheduledTime != nil {
		args = append(args, *scheduledTime)
		setClauses = append(setClauses, fmt.Sprintf("scheduled_time = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		// Return the current stop, verifying org scope inline.
		row := r.pool.QueryRow(ctx, `
			SELECT `+stopSelectCols+`
			FROM stops
			WHERE id = $1 AND route_id = $2
			  AND EXISTS (SELECT 1 FROM routes WHERE id = route_id AND org_id = $3)
		`, stopID, routeID, orgID)
		return scanStop(row)
	}

	args = append(args, stopID)
	stopParam := fmt.Sprintf("$%d", len(args))
	args = append(args, routeID)
	routeParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE stops
		SET %s, updated_at = NOW()
		WHERE id = %s AND route_id = %s
		  AND EXISTS (SELECT 1 FROM routes WHERE id = route_id AND org_id = %s)
		RETURNING `+stopSelectCols,
		strings.Join(setClauses, ", "), stopParam, routeParam, orgParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	s, err := scanStop(row)
	if err != nil {
		return nil, fmt.Errorf("stop update: %w", err)
	}
	return s, nil
}

// DeleteStop removes a stop, verifying org scope via route.
func (r *RouteRepo) DeleteStop(ctx context.Context, stopID, routeID, orgID string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM stops
		WHERE id = $1 AND route_id = $2
		  AND EXISTS (SELECT 1 FROM routes WHERE id = route_id AND org_id = $3)
	`, stopID, routeID, orgID)
	if err != nil {
		return fmt.Errorf("stop delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ListAssignments returns all route assignments for a route. Verifies route belongs to orgID.
func (r *RouteRepo) ListAssignments(ctx context.Context, routeID, orgID string) ([]domain.RouteAssignment, error) {
	ok, err := r.routeBelongsToOrg(ctx, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("assignment list org check: %w", err)
	}
	if !ok {
		return nil, pgx.ErrNoRows
	}

	rows, err := r.pool.Query(ctx, `
		SELECT `+routeAssignmentSelectCols+`
		FROM route_assignments
		WHERE route_id = $1
		ORDER BY created_at DESC
	`, routeID)
	if err != nil {
		return nil, fmt.Errorf("assignment list: %w", err)
	}
	defer rows.Close()

	assignments := make([]domain.RouteAssignment, 0)
	for rows.Next() {
		var ra domain.RouteAssignment
		if err := rows.Scan(
			&ra.ID, &ra.RouteID, &ra.VehicleID, &ra.DriverID,
			&ra.EffectiveDate, &ra.EndDate, &ra.DaysOfWeek,
			&ra.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("assignment list scan: %w", err)
		}
		assignments = append(assignments, ra)
	}
	return assignments, rows.Err()
}

// CreateAssignment inserts a new route assignment. Verifies route belongs to orgID first.
func (r *RouteRepo) CreateAssignment(ctx context.Context, routeID, orgID, vehicleID, driverID, daysOfWeek string, effectiveDate, endDate *pgtype.Date) (*domain.RouteAssignment, error) {
	ok, err := r.routeBelongsToOrg(ctx, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("assignment create org check: %w", err)
	}
	if !ok {
		return nil, pgx.ErrNoRows
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO route_assignments (id, route_id, vehicle_id, driver_id, effective_date, end_date, days_of_week)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
		RETURNING `+routeAssignmentSelectCols,
		routeID, vehicleID, driverID, effectiveDate, endDate, daysOfWeek,
	)
	ra, err := scanRouteAssignment(row)
	if err != nil {
		return nil, fmt.Errorf("assignment create: %w", err)
	}
	return ra, nil
}

// ListStudentsByRoute returns distinct students assigned to a route via student_stops.
// Verifies route belongs to orgID.
func (r *RouteRepo) ListStudentsByRoute(ctx context.Context, routeID, orgID string) ([]domain.Student, error) {
	ok, err := r.routeBelongsToOrg(ctx, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("student list org check: %w", err)
	}
	if !ok {
		return nil, pgx.ErrNoRows
	}

	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT s.id, s.org_id, s.school_id, s.first_name, s.last_name,
		       s.student_number, s.grade, s.rfid_tag_id, s.address, s.city, s.state,
		       s.zip, s.lat, s.lng, s.status, s.medical_notes, s.created_at, s.updated_at
		FROM students s
		JOIN student_stops ss ON ss.student_id = s.id
		WHERE ss.route_id = $1 AND s.org_id = $2
		ORDER BY s.last_name, s.first_name
	`, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("student list by route: %w", err)
	}
	defer rows.Close()

	students := make([]domain.Student, 0)
	for rows.Next() {
		var s domain.Student
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.SchoolID, &s.FirstName, &s.LastName,
			&s.StudentNumber, &s.Grade, &s.RFIDTagID, &s.Address, &s.City, &s.State,
			&s.Zip, &s.Lat, &s.Lng, &s.Status, &s.MedicalNotes,
			&s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("student list by route scan: %w", err)
		}
		students = append(students, s)
	}
	return students, rows.Err()
}
