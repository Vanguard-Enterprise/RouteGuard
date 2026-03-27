package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func normalizeRouteText(v string) string {
	return strings.TrimSpace(v)
}

func (h *Handler) OrgListRoutes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	status := normalizeRouteText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.routes.ListByOrg(ctx, session.OrgID, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list routes")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Route]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgListDeletedRoutes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	status := normalizeRouteText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.routes.ListDeletedByOrg(ctx, session.OrgID, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list deleted routes")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Route]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	route, err := h.routes.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get route")
		return
	}

	stops, err := h.routes.ListRouteStops(ctx, route.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list route stops")
		return
	}
	students, err := h.routes.ListRouteStudents(ctx, route.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list route students")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"route": route,
		"stops": stops,
		"students": students,
	})
}

type updateRouteRequest struct {
	RouteCode              string  `json:"route_code"`
	Status                 string  `json:"status"`
	EstimatedTravelMinutes int     `json:"estimated_travel_minutes"`
	AssignedStudents       int     `json:"assigned_students"`
	SeatUtilization        float64 `json:"seat_utilization"`
	UnassignedCount        int     `json:"unassigned_count"`
}

func (h *Handler) OrgUpdateRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	var body updateRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	existing, err := h.routes.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get route")
		return
	}

	if routeCode := normalizeRouteText(body.RouteCode); routeCode != "" {
		existing.RouteCode = routeCode
	}
	if status := normalizeRouteText(strings.ToLower(body.Status)); status != "" {
		existing.Status = status
	}
	if body.EstimatedTravelMinutes > 0 {
		existing.EstimatedTravelMinutes = body.EstimatedTravelMinutes
	}
	if body.AssignedStudents >= 0 {
		existing.AssignedStudents = body.AssignedStudents
	}
	if body.SeatUtilization >= 0 {
		existing.SeatUtilization = body.SeatUtilization
	}
	if body.UnassignedCount >= 0 {
		existing.UnassignedCount = body.UnassignedCount
	}

	updated, err := h.routes.Update(ctx, existing)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "route_code already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update route")
		return
	}

	JSON(w, http.StatusOK, updated)
}

func (h *Handler) OrgDeleteRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	if _, err := h.routes.GetByID(ctx, session.OrgID, id); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get route")
		return
	}

	if err := h.routes.SoftDelete(ctx, session.OrgID, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete route")
		return
	}
	NoContent(w)
}

func (h *Handler) OrgRestoreRoute(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	route, err := h.routes.Restore(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "route_code already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to restore route")
		return
	}
	JSON(w, http.StatusOK, route)
}

type upsertDriverVehicleAssignmentRequest struct {
	DriverID  string `json:"driver_id"`
	VehicleID string `json:"vehicle_id"`
	IsActive  *bool  `json:"is_active"`
}

func (h *Handler) OrgUpsertDriverVehicleAssignment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body upsertDriverVehicleAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.DriverID = normalizeRouteText(body.DriverID)
	body.VehicleID = normalizeRouteText(body.VehicleID)
	if body.DriverID == "" || body.VehicleID == "" {
		Error(w, http.StatusBadRequest, "driver_id and vehicle_id are required")
		return
	}

	if _, err := h.drivers.GetByID(ctx, session.OrgID, body.DriverID); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to validate driver")
		return
	}
	if _, err := h.vehicles.GetByID(ctx, session.OrgID, body.VehicleID); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to validate vehicle")
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to begin transaction")
		return
	}
	defer tx.Rollback(ctx)

	if isActive {
		if _, err := tx.Exec(ctx,
			`UPDATE driver_vehicle_assignments
			 SET is_active = false, deleted_at = now(), updated_at = now()
			 WHERE org_id = $1 AND deleted_at IS NULL AND (driver_id = $2 OR vehicle_id = $3)`,
			session.OrgID, body.DriverID, body.VehicleID,
		); err != nil {
			Error(w, http.StatusInternalServerError, "failed to clear prior assignments")
			return
		}
	}

	var assignmentID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO driver_vehicle_assignments (org_id, driver_id, vehicle_id, is_active)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		session.OrgID, body.DriverID, body.VehicleID, isActive,
	).Scan(&assignmentID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to create driver vehicle assignment")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		Error(w, http.StatusInternalServerError, "failed to commit assignment")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"id": assignmentID,
		"driver_id": body.DriverID,
		"vehicle_id": body.VehicleID,
		"is_active": isActive,
	})
}

func (h *Handler) OrgListDriverVehicleAssignments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	rows, err := h.pool.Query(ctx,
		`SELECT id, driver_id, vehicle_id, is_active, created_at, updated_at
		 FROM driver_vehicle_assignments
		 WHERE org_id = $1 AND deleted_at IS NULL
		 ORDER BY created_at DESC`,
		session.OrgID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list assignments")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, driverID, vehicleID string
		var isActive bool
		var createdAt, updatedAt any
		if err := rows.Scan(&id, &driverID, &vehicleID, &isActive, &createdAt, &updatedAt); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan assignments")
			return
		}
		items = append(items, map[string]any{
			"id": id,
			"driver_id": driverID,
			"vehicle_id": vehicleID,
			"is_active": isActive,
			"created_at": createdAt,
			"updated_at": updatedAt,
		})
	}
	JSON(w, http.StatusOK, map[string]any{"items": items})
}
