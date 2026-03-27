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

func normalizeDriverText(v string) string {
	return strings.TrimSpace(v)
}

func (h *Handler) OrgListDrivers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeDriverText(r.URL.Query().Get("search"))
	status := normalizeDriverText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.drivers.ListByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list drivers")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Driver]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetDriver(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	driver, err := h.drivers.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get driver")
		return
	}

	JSON(w, http.StatusOK, driver)
}

type createDriverRequest struct {
	DriverID    string `json:"driver_id"`
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	IsAvailable *bool  `json:"is_available"`
	IsActive    *bool  `json:"is_active"`
}

func validateRequiredDriverFields(body createDriverRequest) string {
	switch {
	case body.DriverID == "":
		return "driver_id is required"
	case body.Name == "":
		return "name is required"
	default:
		return ""
	}
}

func (h *Handler) OrgCreateDriver(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body createDriverRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.DriverID = normalizeDriverText(body.DriverID)
	body.Name = normalizeDriverText(body.Name)
	body.Phone = normalizeDriverText(body.Phone)
	if msg := validateRequiredDriverFields(body); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	isAvailable := true
	if body.IsAvailable != nil {
		isAvailable = *body.IsAvailable
	}
	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	driver, err := h.drivers.Create(ctx, &domain.Driver{
		OrgID:       session.OrgID,
		DriverID:    body.DriverID,
		Name:        body.Name,
		Phone:       body.Phone,
		IsAvailable: isAvailable,
		IsActive:    isActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "driver_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create driver")
		return
	}

	JSON(w, http.StatusCreated, driver)
}

type updateDriverRequest struct {
	DriverID    string `json:"driver_id"`
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	IsAvailable *bool  `json:"is_available"`
	IsActive    *bool  `json:"is_active"`
}

func (h *Handler) OrgUpdateDriver(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	var body updateDriverRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.DriverID = normalizeDriverText(body.DriverID)
	body.Name = normalizeDriverText(body.Name)
	body.Phone = normalizeDriverText(body.Phone)
	if msg := validateRequiredDriverFields(createDriverRequest{DriverID: body.DriverID, Name: body.Name}); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	existing, err := h.drivers.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get driver")
		return
	}

	existing.DriverID = body.DriverID
	existing.Name = body.Name
	existing.Phone = body.Phone
	if body.IsAvailable != nil {
		existing.IsAvailable = *body.IsAvailable
	}
	if body.IsActive != nil {
		existing.IsActive = *body.IsActive
	}

	driver, err := h.drivers.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "driver_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update driver")
		return
	}

	JSON(w, http.StatusOK, driver)
}

func (h *Handler) OrgDeleteDriver(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	if _, err := h.drivers.GetByID(ctx, session.OrgID, id); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get driver")
		return
	}

	if err := h.drivers.SoftDelete(ctx, session.OrgID, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete driver")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgListDeletedDrivers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeDriverText(r.URL.Query().Get("search"))
	status := normalizeDriverText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.drivers.ListDeletedByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list deleted drivers")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Driver]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgRestoreDriver(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	driver, err := h.drivers.Restore(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "driver_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to restore driver")
		return
	}

	JSON(w, http.StatusOK, driver)
}
