package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

type createVehicleRequest struct {
	Name         string  `json:"name"`
	Number       *string `json:"number"`
	Capacity     *int    `json:"capacity"`
	Year         *int    `json:"year"`
	Make         *string `json:"make"`
	Model        *string `json:"model"`
	VIN          *string `json:"vin"`
	LicensePlate *string `json:"license_plate"`
	Status       string  `json:"status"`
}

type updateVehicleRequest struct {
	Name         *string `json:"name"`
	Number       *string `json:"number"`
	Capacity     *int    `json:"capacity"`
	Year         *int    `json:"year"`
	Make         *string `json:"make"`
	Model        *string `json:"model"`
	VIN          *string `json:"vin"`
	LicensePlate *string `json:"license_plate"`
	Status       *string `json:"status"`
}

// ListMyVehicles handles GET /dashboard/vehicles
func (h *Handler) ListMyVehicles(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

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

	repo := repository.NewVehicleRepo(h.pool)
	vehicles, err := repo.List(r.Context(), session.OrgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, vehicles)
}

// CreateMyVehicle handles POST /dashboard/vehicles
func (h *Handler) CreateMyVehicle(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	repo := repository.NewVehicleRepo(h.pool)
	vehicle, err := repo.Create(r.Context(), session.OrgID, req.Name, req.Number, req.Capacity, req.Year,
		req.Make, req.Model, req.VIN, req.LicensePlate, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, vehicle)
}

// GetMyVehicle handles GET /dashboard/vehicles/{id}
func (h *Handler) GetMyVehicle(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	repo := repository.NewVehicleRepo(h.pool)
	vehicle, err := repo.Get(r.Context(), id, session.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, vehicle)
}

// UpdateMyVehicle handles PATCH /dashboard/vehicles/{id}
func (h *Handler) UpdateMyVehicle(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	var req updateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewVehicleRepo(h.pool)
	vehicle, err := repo.Update(r.Context(), id, session.OrgID,
		req.Name, req.Number, req.Capacity, req.Year,
		req.Make, req.Model, req.VIN, req.LicensePlate, req.Status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, vehicle)
}

// DeleteMyVehicle handles DELETE /dashboard/vehicles/{id}
// Hard-deletes the vehicle. devices.vehicle_id has ON DELETE SET NULL so no FK restriction.
func (h *Handler) DeleteMyVehicle(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	repo := repository.NewVehicleRepo(h.pool)
	if err := repo.Delete(r.Context(), id, session.OrgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	NoContent(w)
}
