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

func normalizeVehicleText(v string) string {
	return strings.TrimSpace(v)
}

func (h *Handler) OrgListVehicles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeVehicleText(r.URL.Query().Get("search"))
	status := normalizeVehicleText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.vehicles.ListByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list vehicles")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Vehicle]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	vehicle, err := h.vehicles.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get vehicle")
		return
	}

	JSON(w, http.StatusOK, vehicle)
}

func validateRequiredVehicleFields(body createVehicleRequest) string {
	switch {
	case body.VehicleID == "":
		return "vehicle_id is required"
	case body.LicensePlate == "":
		return "license_plate is required"
	case body.Capacity <= 0:
		return "capacity must be greater than 0"
	default:
		return ""
	}
}

type createVehicleRequest struct {
	VehicleID    string `json:"vehicle_id"`
	LicensePlate string `json:"license_plate"`
	Capacity     int    `json:"capacity"`
	IsActive     *bool  `json:"is_active"`
}

func (h *Handler) OrgCreateVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body createVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.VehicleID = normalizeVehicleText(body.VehicleID)
	body.LicensePlate = normalizeVehicleText(body.LicensePlate)

	if msg := validateRequiredVehicleFields(body); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	vehicle, err := h.vehicles.Create(ctx, &domain.Vehicle{
		OrgID:        session.OrgID,
		VehicleID:    body.VehicleID,
		LicensePlate: body.LicensePlate,
		Capacity:     body.Capacity,
		IsActive:     isActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "vehicle_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create vehicle")
		return
	}

	JSON(w, http.StatusCreated, vehicle)
}

type updateVehicleRequest struct {
	VehicleID    string `json:"vehicle_id"`
	LicensePlate string `json:"license_plate"`
	Capacity     int    `json:"capacity"`
	IsActive     *bool  `json:"is_active"`
}

func (h *Handler) OrgUpdateVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	var body updateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.VehicleID = normalizeVehicleText(body.VehicleID)
	body.LicensePlate = normalizeVehicleText(body.LicensePlate)

	if msg := validateRequiredVehicleFields(createVehicleRequest{
		VehicleID:    body.VehicleID,
		LicensePlate: body.LicensePlate,
		Capacity:     body.Capacity,
	}); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	existing, err := h.vehicles.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get vehicle")
		return
	}

	existing.VehicleID = body.VehicleID
	existing.LicensePlate = body.LicensePlate
	existing.Capacity = body.Capacity
	if body.IsActive != nil {
		existing.IsActive = *body.IsActive
	}

	vehicle, err := h.vehicles.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "vehicle_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update vehicle")
		return
	}

	JSON(w, http.StatusOK, vehicle)
}

func (h *Handler) OrgDeleteVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	if _, err := h.vehicles.GetByID(ctx, session.OrgID, id); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get vehicle")
		return
	}

	if err := h.vehicles.SoftDelete(ctx, session.OrgID, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete vehicle")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgListDeletedVehicles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeVehicleText(r.URL.Query().Get("search"))
	status := normalizeVehicleText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.vehicles.ListDeletedByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list deleted vehicles")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Vehicle]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgRestoreVehicle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	vehicle, err := h.vehicles.Restore(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "vehicle not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "vehicle_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to restore vehicle")
		return
	}

	JSON(w, http.StatusOK, vehicle)
}
