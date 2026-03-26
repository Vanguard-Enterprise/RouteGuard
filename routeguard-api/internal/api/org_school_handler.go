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

func normalizeSchoolText(v string) string {
	return strings.TrimSpace(v)
}

func (h *Handler) OrgListSchools(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeSchoolText(r.URL.Query().Get("search"))
	status := normalizeSchoolText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.schools.ListByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list schools")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.School]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetSchool(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	school, err := h.schools.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get school")
		return
	}

	JSON(w, http.StatusOK, school)
}

func validateRequiredSchoolFields(body createSchoolRequest) string {
	switch {
	case body.Name == "":
		return "name is required"
	case body.Address == "":
		return "address is required"
	default:
		return ""
	}
}

type createSchoolRequest struct {
	Name         string `json:"name"`
	Address      string `json:"address"`
	ContactPhone string `json:"contact_phone"`
	IsActive     *bool  `json:"is_active"`
}

func generateSchoolID() (string, error) {
	bytes := make([]byte, 5)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("SCH-%s", strings.ToUpper(hex.EncodeToString(bytes))), nil
}

func (h *Handler) OrgCreateSchool(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body createSchoolRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.Name = normalizeSchoolText(body.Name)
	body.Address = normalizeSchoolText(body.Address)
	body.ContactPhone = normalizeSchoolText(body.ContactPhone)

	if msg := validateRequiredSchoolFields(body); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}
	schoolID, err := generateSchoolID()
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to generate school id")
		return
	}

	school, err := h.schools.Create(ctx, &domain.School{
		OrgID:        session.OrgID,
		SchoolID:     schoolID,
		Name:         body.Name,
		Address:      body.Address,
		ContactPhone: body.ContactPhone,
		IsActive:     isActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "school_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create school")
		return
	}

	JSON(w, http.StatusCreated, school)
}

type updateSchoolRequest struct {
	Name         string `json:"name"`
	Address      string `json:"address"`
	ContactPhone string `json:"contact_phone"`
	IsActive     *bool  `json:"is_active"`
}

func (h *Handler) OrgUpdateSchool(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	var body updateSchoolRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.Name = normalizeSchoolText(body.Name)
	body.Address = normalizeSchoolText(body.Address)
	body.ContactPhone = normalizeSchoolText(body.ContactPhone)

	if msg := validateRequiredSchoolFields(createSchoolRequest{
		Name:    body.Name,
		Address: body.Address,
	}); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	existing, err := h.schools.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get school")
		return
	}

	existing.Name = body.Name
	existing.Address = body.Address
	existing.ContactPhone = body.ContactPhone
	if body.IsActive != nil {
		existing.IsActive = *body.IsActive
	}

	school, err := h.schools.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "school_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update school")
		return
	}

	JSON(w, http.StatusOK, school)
}

func (h *Handler) OrgDeleteSchool(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	if _, err := h.schools.GetByID(ctx, session.OrgID, id); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get school")
		return
	}

	if err := h.schools.SoftDelete(ctx, session.OrgID, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete school")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgListDeletedSchools(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeSchoolText(r.URL.Query().Get("search"))
	status := normalizeSchoolText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.schools.ListDeletedByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list deleted schools")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.School]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgRestoreSchool(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	school, err := h.schools.Restore(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "school_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to restore school")
		return
	}

	JSON(w, http.StatusOK, school)
}
