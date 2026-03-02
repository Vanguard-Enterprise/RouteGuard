package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

type createTripRequest struct {
	RouteAssignmentID string `json:"route_assignment_id"`
	Date              string `json:"date"` // ISO-8601 YYYY-MM-DD
}

type updateTripRequest struct {
	Status *string `json:"status"`
	Notes  *string `json:"notes"`
}

// ListMyTrips handles GET /dashboard/trips
func (h *Handler) ListMyTrips(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	if offset < 0 {
		offset = 0
	}

	var statusFilter *string
	if s := r.URL.Query().Get("status"); s != "" {
		statusFilter = &s
	}
	var dateFilter *string
	if d := r.URL.Query().Get("date"); d != "" {
		if _, err := time.Parse("2006-01-02", d); err != nil {
			Error(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
			return
		}
		dateFilter = &d
	}

	repo := repository.NewTripRepo(h.pool)
	trips, err := repo.List(r.Context(), orgID, limit, offset, statusFilter, dateFilter)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, trips)
}

// CreateMyTrip handles POST /dashboard/trips
func (h *Handler) CreateMyTrip(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req createTripRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RouteAssignmentID == "" {
		Error(w, http.StatusBadRequest, "route_assignment_id is required")
		return
	}
	if req.Date == "" {
		Error(w, http.StatusBadRequest, "date is required")
		return
	}

	t, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		Error(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
		return
	}
	date := pgtype.Date{Time: t, Valid: true}

	repo := repository.NewTripRepo(h.pool)
	trip, err := repo.Create(r.Context(), orgID, req.RouteAssignmentID, date)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "route assignment not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, trip)
}

// GetMyTrip handles GET /dashboard/trips/{id}
func (h *Handler) GetMyTrip(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	repo := repository.NewTripRepo(h.pool)
	trip, err := repo.Get(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "trip not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, trip)
}

// UpdateMyTrip handles PATCH /dashboard/trips/{id}
func (h *Handler) UpdateMyTrip(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	var req updateTripRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewTripRepo(h.pool)
	trip, err := repo.Update(r.Context(), id, orgID, req.Status, req.Notes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "trip not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, trip)
}
