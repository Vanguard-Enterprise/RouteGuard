package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

type createSchoolRequest struct {
	Name         string   `json:"name"`
	Address      *string  `json:"address"`
	City         *string  `json:"city"`
	State        *string  `json:"state"`
	Zip          *string  `json:"zip"`
	Lat          *float64 `json:"lat"`
	Lng          *float64 `json:"lng"`
	Phone        *string  `json:"phone"`
	ContactName  *string  `json:"contact_name"`
	ContactEmail *string  `json:"contact_email"`
}

type updateSchoolRequest struct {
	Name         *string  `json:"name"`
	Address      *string  `json:"address"`
	City         *string  `json:"city"`
	State        *string  `json:"state"`
	Zip          *string  `json:"zip"`
	Lat          *float64 `json:"lat"`
	Lng          *float64 `json:"lng"`
	Phone        *string  `json:"phone"`
	ContactName  *string  `json:"contact_name"`
	ContactEmail *string  `json:"contact_email"`
}

// ListMySchools handles GET /dashboard/schools
func (h *Handler) ListMySchools(w http.ResponseWriter, r *http.Request) {
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

	repo := repository.NewSchoolRepo(h.pool)
	schools, err := repo.List(r.Context(), orgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, schools)
}

// CreateMySchool handles POST /dashboard/schools
func (h *Handler) CreateMySchool(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req createSchoolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}

	repo := repository.NewSchoolRepo(h.pool)
	school, err := repo.Create(r.Context(), orgID, req.Name, req.Address, req.City, req.State, req.Zip, req.Lat, req.Lng, req.Phone, req.ContactName, req.ContactEmail)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, school)
}

// GetMySchool handles GET /dashboard/schools/{id}
func (h *Handler) GetMySchool(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	repo := repository.NewSchoolRepo(h.pool)
	school, err := repo.Get(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, school)
}

// UpdateMySchool handles PATCH /dashboard/schools/{id}
func (h *Handler) UpdateMySchool(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	var req updateSchoolRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewSchoolRepo(h.pool)
	school, err := repo.Update(r.Context(), id, orgID, req.Name, req.Address, req.City, req.State, req.Zip, req.Lat, req.Lng, req.Phone, req.ContactName, req.ContactEmail)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, school)
}

// DeleteMySchool handles DELETE /dashboard/schools/{id}
func (h *Handler) DeleteMySchool(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")

	var studentCount int
	err := h.pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM students WHERE school_id = $1 AND org_id = $2", id, orgID,
	).Scan(&studentCount)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if studentCount > 0 {
		Error(w, http.StatusConflict, "school has enrolled students; reassign them before deleting")
		return
	}

	repo := repository.NewSchoolRepo(h.pool)
	if err := repo.Delete(r.Context(), id, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "school not found")
			return
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			Error(w, http.StatusConflict, "school has enrolled students; reassign them before deleting")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}
