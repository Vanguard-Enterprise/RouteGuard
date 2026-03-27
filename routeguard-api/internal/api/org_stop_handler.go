package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func normalizeStopText(v string) string {
	return strings.TrimSpace(v)
}

func generateStopID() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("STP-%s", strings.ToUpper(hex.EncodeToString(bytes))), nil
}

func (h *Handler) OrgListStops(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeStopText(r.URL.Query().Get("search"))
	status := normalizeStopText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.stops.ListByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list stops")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Stop]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetStop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	stop, err := h.stops.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get stop")
		return
	}
	JSON(w, http.StatusOK, stop)
}

type createStopRequest struct {
	StopID    string  `json:"stop_id"`
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Notes     string  `json:"notes"`
	IsActive  *bool   `json:"is_active"`
}

func validateRequiredStopFields(body createStopRequest) string {
	switch {
	case body.Name == "":
		return "name is required"
	case body.Address == "":
		return "address is required"
	case body.Latitude < -90 || body.Latitude > 90:
		return "latitude must be between -90 and 90"
	case body.Longitude < -180 || body.Longitude > 180:
		return "longitude must be between -180 and 180"
	default:
		return ""
	}
}

func (h *Handler) OrgCreateStop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body createStopRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.StopID = normalizeStopText(body.StopID)
	body.Name = normalizeStopText(body.Name)
	body.Address = normalizeStopText(body.Address)
	body.Notes = normalizeStopText(body.Notes)
	if msg := validateRequiredStopFields(body); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}
	if body.StopID == "" {
		stopID, err := generateStopID()
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to generate stop id")
			return
		}
		body.StopID = stopID
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	stop, err := h.stops.Create(ctx, &domain.Stop{
		OrgID:     session.OrgID,
		StopID:    body.StopID,
		Name:      body.Name,
		Address:   body.Address,
		Latitude:  body.Latitude,
		Longitude: body.Longitude,
		Notes:     body.Notes,
		IsActive:  isActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "stop_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create stop")
		return
	}

	JSON(w, http.StatusCreated, stop)
}

type updateStopRequest struct {
	StopID    string  `json:"stop_id"`
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Notes     string  `json:"notes"`
	IsActive  *bool   `json:"is_active"`
}

func (h *Handler) OrgUpdateStop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	var body updateStopRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.StopID = normalizeStopText(body.StopID)
	body.Name = normalizeStopText(body.Name)
	body.Address = normalizeStopText(body.Address)
	body.Notes = normalizeStopText(body.Notes)
	if msg := validateRequiredStopFields(createStopRequest{
		Name:      body.Name,
		Address:   body.Address,
		Latitude:  body.Latitude,
		Longitude: body.Longitude,
	}); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	existing, err := h.stops.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get stop")
		return
	}

	if body.StopID != "" {
		existing.StopID = body.StopID
	}
	existing.Name = body.Name
	existing.Address = body.Address
	existing.Latitude = body.Latitude
	existing.Longitude = body.Longitude
	existing.Notes = body.Notes
	if body.IsActive != nil {
		existing.IsActive = *body.IsActive
	}

	stop, err := h.stops.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "stop_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update stop")
		return
	}

	JSON(w, http.StatusOK, stop)
}

func (h *Handler) OrgDeleteStop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	if _, err := h.stops.GetByID(ctx, session.OrgID, id); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get stop")
		return
	}

	if err := h.stops.SoftDelete(ctx, session.OrgID, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete stop")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgListDeletedStops(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeStopText(r.URL.Query().Get("search"))
	status := normalizeStopText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.stops.ListDeletedByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list deleted stops")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Stop]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgRestoreStop(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	stop, err := h.stops.Restore(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "stop_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to restore stop")
		return
	}
	JSON(w, http.StatusOK, stop)
}

type upsertStudentStopAssignmentRequest struct {
	StopID        string `json:"stop_id"`
	ServiceWindow string `json:"service_window"`
	IsActive      *bool  `json:"is_active"`
}

func (h *Handler) OrgUpsertStudentStopAssignment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	studentID := chi.URLParam(r, "id")

	var body upsertStudentStopAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.StopID = normalizeStopText(body.StopID)
	body.ServiceWindow = strings.ToUpper(normalizeStopText(body.ServiceWindow))
	if body.ServiceWindow == "" {
		body.ServiceWindow = "PM"
	}
	if body.ServiceWindow != "PM" && body.ServiceWindow != "AM" {
		Error(w, http.StatusBadRequest, "service_window must be AM or PM")
		return
	}
	if body.StopID == "" {
		Error(w, http.StatusBadRequest, "stop_id is required")
		return
	}

	if _, err := h.students.GetByID(ctx, session.OrgID, studentID); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to validate student")
		return
	}
	if _, err := h.stops.GetByID(ctx, session.OrgID, body.StopID); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "stop not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to validate stop")
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	_, err := h.pool.Exec(ctx,
		`INSERT INTO student_stop_assignments (org_id, student_id, stop_id, service_window, is_active)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (org_id, student_id, service_window) WHERE deleted_at IS NULL
		 DO UPDATE SET stop_id = EXCLUDED.stop_id, is_active = EXCLUDED.is_active, updated_at = now()`,
		session.OrgID, studentID, body.StopID, body.ServiceWindow, isActive,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to upsert student stop assignment")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"student_id": studentID,
		"stop_id": body.StopID,
		"service_window": body.ServiceWindow,
		"is_active": isActive,
	})
}
