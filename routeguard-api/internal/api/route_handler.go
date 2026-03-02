package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

// ── Request types ────────────────────────────────────────────────────────────

type createRouteRequest struct {
	Name                 string  `json:"name"`
	Type                 string  `json:"type"`
	Status               string  `json:"status"`
	Description          *string `json:"description"`
	EstimatedDurationMin *int    `json:"estimated_duration_min"`
}

type updateRouteRequest struct {
	Name                 *string `json:"name"`
	Type                 *string `json:"type"`
	Status               *string `json:"status"`
	Description          *string `json:"description"`
	EstimatedDurationMin *int    `json:"estimated_duration_min"`
}

type createStopRequest struct {
	Name          string   `json:"name"`
	Address       *string  `json:"address"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	SequenceOrder *int     `json:"sequence_order"`
	ScheduledTime *string  `json:"scheduled_time"`
}

type updateStopRequest struct {
	Name          *string  `json:"name"`
	Address       *string  `json:"address"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	SequenceOrder *int     `json:"sequence_order"`
	ScheduledTime *string  `json:"scheduled_time"`
}

type createAssignmentRequest struct {
	VehicleID     string       `json:"vehicle_id"`
	DriverID      string       `json:"driver_id"`
	DaysOfWeek    string       `json:"days_of_week"`
	EffectiveDate *pgtype.Date `json:"effective_date"`
	EndDate       *pgtype.Date `json:"end_date"`
}

// ── Route handlers ───────────────────────────────────────────────────────────

// ListMyRoutes handles GET /dashboard/routes
func (h *Handler) ListMyRoutes(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}

	repo := repository.NewRouteRepo(h.pool)
	routes, err := repo.List(r.Context(), orgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, routes)
}

// CreateMyRoute handles POST /dashboard/routes
func (h *Handler) CreateMyRoute(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req createRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Type == "" {
		req.Type = "morning"
	}
	if req.Status == "" {
		req.Status = "draft"
	}

	repo := repository.NewRouteRepo(h.pool)
	route, err := repo.Create(r.Context(), orgID, req.Name, req.Type, req.Status, req.Description, req.EstimatedDurationMin)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, route)
}

// GetMyRoute handles GET /dashboard/routes/{id}
func (h *Handler) GetMyRoute(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	repo := repository.NewRouteRepo(h.pool)
	route, err := repo.Get(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, route)
}

// UpdateMyRoute handles PATCH /dashboard/routes/{id}
func (h *Handler) UpdateMyRoute(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	var req updateRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewRouteRepo(h.pool)
	route, err := repo.Update(r.Context(), id, orgID, req.Name, req.Type, req.Status, req.Description, req.EstimatedDurationMin)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, route)
}

// DeleteMyRoute handles DELETE /dashboard/routes/{id}
func (h *Handler) DeleteMyRoute(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	repo := repository.NewRouteRepo(h.pool)
	if err := repo.Delete(r.Context(), id, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ── Stop handlers ────────────────────────────────────────────────────────────

// ListRouteStops handles GET /dashboard/routes/{id}/stops
func (h *Handler) ListRouteStops(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	repo := repository.NewRouteRepo(h.pool)
	stops, err := repo.ListStops(r.Context(), routeID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, stops)
}

// CreateRouteStop handles POST /dashboard/routes/{id}/stops
func (h *Handler) CreateRouteStop(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	var req createStopRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.SequenceOrder == nil {
		Error(w, http.StatusBadRequest, "name and sequence_order are required")
		return
	}

	repo := repository.NewRouteRepo(h.pool)
	stop, err := repo.CreateStop(r.Context(), routeID, orgID, req.Name, req.Address, req.Lat, req.Lng, *req.SequenceOrder, req.ScheduledTime)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, stop)
}

// UpdateRouteStop handles PATCH /dashboard/routes/{id}/stops/{stopId}
func (h *Handler) UpdateRouteStop(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	stopID := chi.URLParam(r, "stopId")
	var req updateStopRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewRouteRepo(h.pool)
	stop, err := repo.UpdateStop(r.Context(), stopID, routeID, orgID, req.Name, req.Address, req.Lat, req.Lng, req.SequenceOrder, req.ScheduledTime)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, stop)
}

// DeleteRouteStop handles DELETE /dashboard/routes/{id}/stops/{stopId}
func (h *Handler) DeleteRouteStop(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	stopID := chi.URLParam(r, "stopId")
	repo := repository.NewRouteRepo(h.pool)
	if err := repo.DeleteStop(r.Context(), stopID, routeID, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ── Assignment handlers ──────────────────────────────────────────────────────

// ListRouteAssignments handles GET /dashboard/routes/{id}/assignments
func (h *Handler) ListRouteAssignments(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	repo := repository.NewRouteRepo(h.pool)
	assignments, err := repo.ListAssignments(r.Context(), routeID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, assignments)
}

// CreateRouteAssignment handles POST /dashboard/routes/{id}/assignments
func (h *Handler) CreateRouteAssignment(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	var req createAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.VehicleID == "" || req.DriverID == "" || req.DaysOfWeek == "" {
		Error(w, http.StatusBadRequest, "vehicle_id, driver_id, and days_of_week are required")
		return
	}

	repo := repository.NewRouteRepo(h.pool)
	assignment, err := repo.CreateAssignment(r.Context(), routeID, orgID, req.VehicleID, req.DriverID, req.DaysOfWeek, req.EffectiveDate, req.EndDate)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, assignment)
}

// ── Student handlers ─────────────────────────────────────────────────────────

// ListRouteStudents handles GET /dashboard/routes/{id}/students
func (h *Handler) ListRouteStudents(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	routeID := chi.URLParam(r, "id")
	repo := repository.NewRouteRepo(h.pool)
	students, err := repo.ListStudentsByRoute(r.Context(), routeID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	for i := range students {
		if err := h.decryptStudent(&students[i]); err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	JSON(w, http.StatusOK, students)
}

