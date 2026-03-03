package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/repository"
)

// ListOrgs handles GET /admin/organizations
func (h *Handler) ListOrgs(w http.ResponseWriter, r *http.Request) {
	repo := repository.NewOrgRepo(h.pool)
	orgs, err := repo.List(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, orgs)
}

// createOrgRequest is the request body for POST /admin/organizations.
type createOrgRequest struct {
	Name     string          `json:"name"`
	Slug     string          `json:"slug"`
	Type     string          `json:"type"`
	Timezone string          `json:"timezone"`
	Settings json.RawMessage `json:"settings"`
}

// CreateOrg handles POST /admin/organizations
func (h *Handler) CreateOrg(w http.ResponseWriter, r *http.Request) {
	var req createOrgRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Slug == "" || req.Type == "" {
		Error(w, http.StatusBadRequest, "name, slug, and type are required")
		return
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	repo := repository.NewOrgRepo(h.pool)
	org, err := repo.Create(r.Context(), req.Name, req.Slug, req.Type, req.Timezone, req.Settings)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := repo.SeedSystemRoles(r.Context(), org.ID); err != nil {
		// Non-fatal: org was created; log and continue.
		_ = err
	}

	JSON(w, http.StatusCreated, org)
	h.LogAudit(r, "org.created", "organization", org.ID, map[string]any{"org_id": org.ID})
}

// GetOrg handles GET /admin/organizations/{id}
func (h *Handler) GetOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	repo := repository.NewOrgRepo(h.pool)
	org, err := repo.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, org)
}

// updateOrgRequest is the request body for PATCH /admin/organizations/{id}.
type updateOrgRequest struct {
	Name     *string         `json:"name"`
	Slug     *string         `json:"slug"`
	Timezone *string         `json:"timezone"`
	Settings json.RawMessage `json:"settings"`
	LogoURL  *string         `json:"logo_url"`
}

// UpdateOrg handles PATCH /admin/organizations/{id}
func (h *Handler) UpdateOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateOrgRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewOrgRepo(h.pool)
	org, err := repo.Update(r.Context(), id, req.Name, req.Slug, req.Timezone, req.Settings, req.LogoURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, org)
	h.LogAudit(r, "org.updated", "organization", id, map[string]any{"org_id": id})
}

// DeleteOrg handles DELETE /admin/organizations/{id}
func (h *Handler) DeleteOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	repo := repository.NewOrgRepo(h.pool)

	// Guard: reject if org has users or devices
	var userCount int
	err := h.pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM users WHERE org_id = $1", id,
	).Scan(&userCount)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if userCount > 0 {
		Error(w, http.StatusConflict, "organization has active users; remove them before deleting")
		return
	}
	var deviceCount int
	err = h.pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM devices WHERE org_id = $1 AND status != 'revoked'", id,
	).Scan(&deviceCount)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if deviceCount > 0 {
		Error(w, http.StatusConflict, "organization has active devices; revoke them before deleting")
		return
	}

	if err := repo.Delete(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
	h.LogAudit(r, "org.deleted", "organization", id, map[string]any{"org_id": id})
}
