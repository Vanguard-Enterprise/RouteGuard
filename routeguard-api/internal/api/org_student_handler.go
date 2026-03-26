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

func normalizeStudentText(v string) string {
	return strings.TrimSpace(v)
}

func (h *Handler) OrgListStudents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeStudentText(r.URL.Query().Get("search"))
	status := normalizeStudentText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.students.ListByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list students")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Student]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetStudent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	student, err := h.students.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get student")
		return
	}

	JSON(w, http.StatusOK, student)
}

func validateRequiredStudentFields(body createStudentRequest) string {
	switch {
	case body.StudentID == "":
		return "student_id is required"
	case body.FirstName == "":
		return "first_name is required"
	case body.LastName == "":
		return "last_name is required"
	case body.Grade == "":
		return "grade is required"
	case body.School == "":
		return "school is required"
	default:
		return ""
	}
}

type createStudentRequest struct {
	StudentID       string `json:"student_id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	Grade           string `json:"grade"`
	School          string `json:"school"`
	GuardianName    string `json:"guardian_name"`
	GuardianContact string `json:"guardian_contact"`
	IsActive        *bool  `json:"is_active"`
}

func (h *Handler) OrgCreateStudent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body createStudentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.StudentID = normalizeStudentText(body.StudentID)
	body.FirstName = normalizeStudentText(body.FirstName)
	body.LastName = normalizeStudentText(body.LastName)
	body.Grade = normalizeStudentText(body.Grade)
	body.School = normalizeStudentText(body.School)
	body.GuardianName = normalizeStudentText(body.GuardianName)
	body.GuardianContact = normalizeStudentText(body.GuardianContact)

	if msg := validateRequiredStudentFields(body); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	student, err := h.students.Create(ctx, &domain.Student{
		OrgID:           session.OrgID,
		StudentID:       body.StudentID,
		FirstName:       body.FirstName,
		LastName:        body.LastName,
		Grade:           body.Grade,
		School:          body.School,
		GuardianName:    body.GuardianName,
		GuardianContact: body.GuardianContact,
		IsActive:        isActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "student_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create student")
		return
	}

	JSON(w, http.StatusCreated, student)
}

type updateStudentRequest struct {
	StudentID       string `json:"student_id"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	Grade           string `json:"grade"`
	School          string `json:"school"`
	GuardianName    string `json:"guardian_name"`
	GuardianContact string `json:"guardian_contact"`
	IsActive        *bool  `json:"is_active"`
}

func (h *Handler) OrgUpdateStudent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	var body updateStudentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.StudentID = normalizeStudentText(body.StudentID)
	body.FirstName = normalizeStudentText(body.FirstName)
	body.LastName = normalizeStudentText(body.LastName)
	body.Grade = normalizeStudentText(body.Grade)
	body.School = normalizeStudentText(body.School)
	body.GuardianName = normalizeStudentText(body.GuardianName)
	body.GuardianContact = normalizeStudentText(body.GuardianContact)

	if msg := validateRequiredStudentFields(createStudentRequest{
		StudentID: body.StudentID,
		FirstName: body.FirstName,
		LastName:  body.LastName,
		Grade:     body.Grade,
		School:    body.School,
	}); msg != "" {
		Error(w, http.StatusBadRequest, msg)
		return
	}

	existing, err := h.students.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get student")
		return
	}

	existing.StudentID = body.StudentID
	existing.FirstName = body.FirstName
	existing.LastName = body.LastName
	existing.Grade = body.Grade
	existing.School = body.School
	existing.GuardianName = body.GuardianName
	existing.GuardianContact = body.GuardianContact
	if body.IsActive != nil {
		existing.IsActive = *body.IsActive
	}

	student, err := h.students.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "student_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update student")
		return
	}

	JSON(w, http.StatusOK, student)
}

func (h *Handler) OrgDeleteStudent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	if _, err := h.students.GetByID(ctx, session.OrgID, id); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get student")
		return
	}

	if err := h.students.SoftDelete(ctx, session.OrgID, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete student")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgListDeletedStudents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	search := normalizeStudentText(r.URL.Query().Get("search"))
	status := normalizeStudentText(strings.ToLower(r.URL.Query().Get("status")))
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.students.ListDeletedByOrg(ctx, session.OrgID, search, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list deleted students")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Student]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgRestoreStudent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	student, err := h.students.Restore(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "student_id already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to restore student")
		return
	}

	JSON(w, http.StatusOK, student)
}
