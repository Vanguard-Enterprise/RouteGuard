package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type RouteRepo struct {
	pool *pgxpool.Pool
}

func NewRouteRepo(pool *pgxpool.Pool) *RouteRepo {
	return &RouteRepo{pool: pool}
}

func (r *RouteRepo) ListByOrg(ctx context.Context, orgID, status string, page, perPage int) ([]domain.Route, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := routeListFilter(orgID, status, false)

	countQuery := "SELECT COUNT(*) FROM routes" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count routes: %w", err)
	}

	dataQuery := `SELECT id, org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
	              estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count, created_at, updated_at, deleted_at
	              FROM routes` + where +
		` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list routes: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Route, 0)
	for rows.Next() {
		var rt domain.Route
		if err := rows.Scan(
			&rt.ID, &rt.OrgID, &rt.PlannerRunID, &rt.RouteCode, &rt.ServiceWindow, &rt.Status, &rt.ObjectiveMode,
			&rt.VehicleID, &rt.DriverID, &rt.EstimatedTravelMinutes, &rt.AssignedStudents, &rt.SeatUtilization,
			&rt.UnassignedCount, &rt.CreatedAt, &rt.UpdatedAt, &rt.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan route: %w", err)
		}
		items = append(items, rt)
	}

	return items, total, nil
}

func (r *RouteRepo) ListDeletedByOrg(ctx context.Context, orgID, status string, page, perPage int) ([]domain.Route, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := routeListFilter(orgID, status, true)

	countQuery := "SELECT COUNT(*) FROM routes" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deleted routes: %w", err)
	}

	dataQuery := `SELECT id, org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
	              estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count, created_at, updated_at, deleted_at
	              FROM routes` + where +
		` ORDER BY deleted_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deleted routes: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Route, 0)
	for rows.Next() {
		var rt domain.Route
		if err := rows.Scan(
			&rt.ID, &rt.OrgID, &rt.PlannerRunID, &rt.RouteCode, &rt.ServiceWindow, &rt.Status, &rt.ObjectiveMode,
			&rt.VehicleID, &rt.DriverID, &rt.EstimatedTravelMinutes, &rt.AssignedStudents, &rt.SeatUtilization,
			&rt.UnassignedCount, &rt.CreatedAt, &rt.UpdatedAt, &rt.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan deleted route: %w", err)
		}
		items = append(items, rt)
	}

	return items, total, nil
}

func routeListFilter(orgID, status string, deleted bool) (string, []any, int) {
	clauses := []string{"org_id = $1"}
	if deleted {
		clauses = append(clauses, "deleted_at IS NOT NULL")
	} else {
		clauses = append(clauses, "deleted_at IS NULL")
	}
	args := []any{orgID}
	next := 2

	status = strings.TrimSpace(strings.ToLower(status))
	if status != "" && status != "all" {
		clauses = append(clauses, "status = $"+strconv.Itoa(next))
		args = append(args, status)
		next++
	}

	return " WHERE " + strings.Join(clauses, " AND "), args, next
}

func (r *RouteRepo) GetByID(ctx context.Context, orgID, id string) (*domain.Route, error) {
	var rt domain.Route
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
		        estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count, created_at, updated_at, deleted_at
		 FROM routes
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	).Scan(
		&rt.ID, &rt.OrgID, &rt.PlannerRunID, &rt.RouteCode, &rt.ServiceWindow, &rt.Status, &rt.ObjectiveMode,
		&rt.VehicleID, &rt.DriverID, &rt.EstimatedTravelMinutes, &rt.AssignedStudents, &rt.SeatUtilization,
		&rt.UnassignedCount, &rt.CreatedAt, &rt.UpdatedAt, &rt.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get route: %w", err)
	}
	return &rt, nil
}

func (r *RouteRepo) Create(ctx context.Context, route *domain.Route) (*domain.Route, error) {
	var rt domain.Route
	err := r.pool.QueryRow(ctx,
		`INSERT INTO routes (
		 org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
		 estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		 RETURNING id, org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
		 estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count, created_at, updated_at, deleted_at`,
		route.OrgID, route.PlannerRunID, route.RouteCode, route.ServiceWindow, route.Status, route.ObjectiveMode,
		route.VehicleID, route.DriverID, route.EstimatedTravelMinutes, route.AssignedStudents, route.SeatUtilization,
		route.UnassignedCount,
	).Scan(
		&rt.ID, &rt.OrgID, &rt.PlannerRunID, &rt.RouteCode, &rt.ServiceWindow, &rt.Status, &rt.ObjectiveMode,
		&rt.VehicleID, &rt.DriverID, &rt.EstimatedTravelMinutes, &rt.AssignedStudents, &rt.SeatUtilization,
		&rt.UnassignedCount, &rt.CreatedAt, &rt.UpdatedAt, &rt.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create route: %w", err)
	}
	return &rt, nil
}

func (r *RouteRepo) Update(ctx context.Context, route *domain.Route) (*domain.Route, error) {
	var rt domain.Route
	err := r.pool.QueryRow(ctx,
		`UPDATE routes
		 SET route_code = $3, status = $4, vehicle_id = $5, driver_id = $6,
		     estimated_travel_minutes = $7, assigned_students = $8, seat_utilization = $9,
		     unassigned_count = $10, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING id, org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
		 estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count, created_at, updated_at, deleted_at`,
		route.ID, route.OrgID, route.RouteCode, route.Status, route.VehicleID, route.DriverID,
		route.EstimatedTravelMinutes, route.AssignedStudents, route.SeatUtilization, route.UnassignedCount,
	).Scan(
		&rt.ID, &rt.OrgID, &rt.PlannerRunID, &rt.RouteCode, &rt.ServiceWindow, &rt.Status, &rt.ObjectiveMode,
		&rt.VehicleID, &rt.DriverID, &rt.EstimatedTravelMinutes, &rt.AssignedStudents, &rt.SeatUtilization,
		&rt.UnassignedCount, &rt.CreatedAt, &rt.UpdatedAt, &rt.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update route: %w", err)
	}
	return &rt, nil
}

func (r *RouteRepo) SoftDelete(ctx context.Context, orgID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE routes
		 SET deleted_at = now(), status = 'archived', updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	)
	if err != nil {
		return fmt.Errorf("delete route: %w", err)
	}
	return nil
}

func (r *RouteRepo) Restore(ctx context.Context, orgID, id string) (*domain.Route, error) {
	var rt domain.Route
	err := r.pool.QueryRow(ctx,
		`UPDATE routes
		 SET deleted_at = NULL, status = 'draft', updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NOT NULL
		 RETURNING id, org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
		 estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count, created_at, updated_at, deleted_at`,
		id, orgID,
	).Scan(
		&rt.ID, &rt.OrgID, &rt.PlannerRunID, &rt.RouteCode, &rt.ServiceWindow, &rt.Status, &rt.ObjectiveMode,
		&rt.VehicleID, &rt.DriverID, &rt.EstimatedTravelMinutes, &rt.AssignedStudents, &rt.SeatUtilization,
		&rt.UnassignedCount, &rt.CreatedAt, &rt.UpdatedAt, &rt.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("restore route: %w", err)
	}
	return &rt, nil
}

func (r *RouteRepo) ListRouteStops(ctx context.Context, routeID string) ([]domain.RouteStop, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, route_id, stop_id, stop_order, eta_minutes, student_count, created_at
		 FROM route_stops
		 WHERE route_id = $1
		 ORDER BY stop_order`,
		routeID,
	)
	if err != nil {
		return nil, fmt.Errorf("list route stops: %w", err)
	}
	defer rows.Close()

	items := make([]domain.RouteStop, 0)
	for rows.Next() {
		var rs domain.RouteStop
		if err := rows.Scan(&rs.ID, &rs.RouteID, &rs.StopID, &rs.StopOrder, &rs.ETAMinutes, &rs.StudentCount, &rs.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan route stop: %w", err)
		}
		items = append(items, rs)
	}
	return items, nil
}

func (r *RouteRepo) ListRouteStudents(ctx context.Context, routeID string) ([]domain.RouteStudent, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, route_id, student_id, stop_id, stop_order, created_at
		 FROM route_students
		 WHERE route_id = $1
		 ORDER BY stop_order, created_at`,
		routeID,
	)
	if err != nil {
		return nil, fmt.Errorf("list route students: %w", err)
	}
	defer rows.Close()

	items := make([]domain.RouteStudent, 0)
	for rows.Next() {
		var rs domain.RouteStudent
		if err := rows.Scan(&rs.ID, &rs.RouteID, &rs.StudentID, &rs.StopID, &rs.StopOrder, &rs.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan route student: %w", err)
		}
		items = append(items, rs)
	}
	return items, nil
}
