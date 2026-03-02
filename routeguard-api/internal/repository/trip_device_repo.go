package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// StopWithStudents pairs a route stop with the students assigned to it.
type StopWithStudents struct {
	Stop     domain.Stop      `json:"stop"`
	Students []domain.Student `json:"students"`
}

// TripDeviceRepo provides trip-related queries used exclusively by the device API.
// All operations are scoped to an org and require a valid trip session.
type TripDeviceRepo struct {
	pool *pgxpool.Pool
}

// NewTripDeviceRepo creates a new TripDeviceRepo.
func NewTripDeviceRepo(pool *pgxpool.Pool) *TripDeviceRepo {
	return &TripDeviceRepo{pool: pool}
}

const tripLocationSelectCols = `id, trip_id, lat, lng, speed, heading, recorded_at`

func scanTripLocation(row pgx.Row) (*domain.TripLocation, error) {
	var loc domain.TripLocation
	if err := row.Scan(
		&loc.ID, &loc.TripID, &loc.Lat, &loc.Lng, &loc.Speed, &loc.Heading, &loc.RecordedAt,
	); err != nil {
		return nil, err
	}
	return &loc, nil
}

// FindActiveAssignment finds the active route assignment for a driver+vehicle combination
// scoped to the org. Returns the most recent active assignment (effective_date <= TODAY,
// end_date IS NULL OR >= TODAY). Returns pgx.ErrNoRows if none found.
func (r *TripDeviceRepo) FindActiveAssignment(ctx context.Context, driverID, vehicleID, orgID string) (*domain.RouteAssignment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+routeAssignmentSelectCols+`
		FROM route_assignments ra
		JOIN routes rt ON rt.id = ra.route_id
		WHERE ra.driver_id  = $1
		  AND ra.vehicle_id = $2
		  AND rt.org_id     = $3
		  AND (ra.effective_date IS NULL OR ra.effective_date <= CURRENT_DATE)
		  AND (ra.end_date       IS NULL OR ra.end_date       >= CURRENT_DATE)
		ORDER BY ra.created_at DESC
		LIMIT 1
	`, driverID, vehicleID, orgID)
	ra, err := scanRouteAssignment(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("trip device find assignment: %w", err)
	}
	return ra, nil
}

// StartTrip creates a new trip for the given route assignment with status=in_progress,
// started_at=NOW(), date=TODAY. Atomically verifies the route_assignment belongs to the org.
// Returns pgx.ErrNoRows if route_assignment not found or belongs to a different org.
func (r *TripDeviceRepo) StartTrip(ctx context.Context, orgID, routeAssignmentID string) (*domain.Trip, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO trips (id, route_assignment_id, org_id, date, status, started_at)
		SELECT gen_random_uuid(), ra.id, $2, CURRENT_DATE, 'in_progress', NOW()
		FROM route_assignments ra
		JOIN routes rt ON rt.id = ra.route_id
		WHERE ra.id = $1 AND rt.org_id = $2
		RETURNING `+tripSelectCols,
		routeAssignmentID, orgID,
	)
	t, err := scanTrip(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("trip device start trip: %w", err)
	}
	return t, nil
}

// InsertLocation records a GPS location for a trip.
// Verifies org scope by joining on trips. Returns pgx.ErrNoRows if the trip does not
// belong to orgID.
func (r *TripDeviceRepo) InsertLocation(ctx context.Context, tripID, orgID string, lat, lng float64, speed, heading *float64) (*domain.TripLocation, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO trip_locations (trip_id, lat, lng, speed, heading)
		SELECT $1, $2, $3, $4, $5
		FROM trips
		WHERE id = $1 AND org_id = $6
		RETURNING `+tripLocationSelectCols,
		tripID, lat, lng, speed, heading, orgID,
	)
	loc, err := scanTripLocation(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("trip device insert location: %w", err)
	}
	return loc, nil
}

// CompleteTrip sets a trip to status=completed, completed_at=NOW() scoped to orgID.
// Returns pgx.ErrNoRows if not found or not in in_progress status.
func (r *TripDeviceRepo) CompleteTrip(ctx context.Context, tripID, orgID string) (*domain.Trip, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE trips
		SET status = 'completed', completed_at = NOW()
		WHERE id = $1 AND org_id = $2 AND status = 'in_progress'
		RETURNING `+tripSelectCols,
		tripID, orgID,
	)
	t, err := scanTrip(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("trip device complete trip: %w", err)
	}
	return t, nil
}

// CountBoardings returns the count of DISTINCT students with scan_type='board' for the trip.
func (r *TripDeviceRepo) CountBoardings(ctx context.Context, tripID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT student_id)
		FROM scan_events
		WHERE trip_id = $1 AND scan_type = 'board' AND student_id IS NOT NULL
	`, tripID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("trip device count boardings: %w", err)
	}
	return count, nil
}

// CountRouteStudents returns the count of active student_stops for the given route.
// Active means effective_date IS NULL OR <= TODAY and end_date IS NULL OR >= TODAY.
func (r *TripDeviceRepo) CountRouteStudents(ctx context.Context, routeID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT student_id)
		FROM student_stops
		WHERE route_id = $1
		  AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
		  AND (end_date       IS NULL OR end_date       >= CURRENT_DATE)
	`, routeID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("trip device count route students: %w", err)
	}
	return count, nil
}

// ListStopsWithStudents returns stops for a route with their assigned students.
// Uses two queries: stops ordered by sequence_order, then students per stop via student_stops.
func (r *TripDeviceRepo) ListStopsWithStudents(ctx context.Context, routeID, orgID string) ([]StopWithStudents, error) {
	// First: get all stops for the route (org check via JOIN on routes).
	rows, err := r.pool.Query(ctx, `
		SELECT `+stopSelectCols+`
		FROM stops s
		WHERE s.route_id = $1
		  AND EXISTS (SELECT 1 FROM routes WHERE id = $1 AND org_id = $2)
		ORDER BY s.sequence_order
	`, routeID, orgID)
	if err != nil {
		return nil, fmt.Errorf("trip device list stops: %w", err)
	}
	defer rows.Close()

	var stops []domain.Stop
	for rows.Next() {
		var s domain.Stop
		if err := rows.Scan(
			&s.ID, &s.RouteID, &s.Name, &s.Address, &s.Lat, &s.Lng,
			&s.SequenceOrder, &s.ScheduledTime,
			&s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("trip device list stops scan: %w", err)
		}
		stops = append(stops, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("trip device list stops rows: %w", err)
	}

	result := make([]StopWithStudents, 0, len(stops))

	// Second: for each stop, get its active students.
	for _, stop := range stops {
		studentRows, err := r.pool.Query(ctx, `
			SELECT s.id, s.org_id, s.school_id, s.first_name, s.last_name,
			       s.student_number, s.grade, s.rfid_tag_id, s.address,
			       s.city, s.state, s.zip, s.lat, s.lng,
			       s.status, s.medical_notes, s.created_at, s.updated_at
			FROM students s
			JOIN student_stops ss ON ss.student_id = s.id
			WHERE ss.stop_id  = $1
			  AND ss.route_id = $2
			  AND (ss.effective_date IS NULL OR ss.effective_date <= CURRENT_DATE)
			  AND (ss.end_date       IS NULL OR ss.end_date       >= CURRENT_DATE)
			ORDER BY s.last_name, s.first_name
		`, stop.ID, routeID)
		if err != nil {
			return nil, fmt.Errorf("trip device list students for stop: %w", err)
		}

		students := make([]domain.Student, 0)
		for studentRows.Next() {
			var st domain.Student
			if err := studentRows.Scan(
				&st.ID, &st.OrgID, &st.SchoolID, &st.FirstName, &st.LastName,
				&st.StudentNumber, &st.Grade, &st.RFIDTagID, &st.Address,
				&st.City, &st.State, &st.Zip, &st.Lat, &st.Lng,
				&st.Status, &st.MedicalNotes, &st.CreatedAt, &st.UpdatedAt,
			); err != nil {
				studentRows.Close()
				return nil, fmt.Errorf("trip device list students scan: %w", err)
			}
			students = append(students, st)
		}
		studentRows.Close()
		if err := studentRows.Err(); err != nil {
			return nil, fmt.Errorf("trip device list students rows: %w", err)
		}

		result = append(result, StopWithStudents{
			Stop:     stop,
			Students: students,
		})
	}

	return result, nil
}
