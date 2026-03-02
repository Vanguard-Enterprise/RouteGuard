package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

// ============================================================
// Request / response types
// ============================================================

type assignRoleRequest struct {
	RoleID string `json:"role_id"`
}

type createRoleRequest struct {
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}

type updateRoleRequest struct {
	Name        *string  `json:"name"`
	Permissions []string `json:"permissions"` // nil means no change; [] means clear
}

type createAPIKeyRequest struct {
	Name      string   `json:"name"`
	Scopes    []string `json:"scopes"`
	ExpiresAt *string  `json:"expires_at"` // RFC3339 or nil
}

// createAPIKeyResponse wraps APIKey + the one-time raw key.
type createAPIKeyResponse struct {
	*domain.APIKey
	Key string `json:"key"` // raw key, shown once
}

// ============================================================
// User handlers
// ============================================================

// ListOrgUsers handles GET /dashboard/settings/users
func (h *Handler) ListOrgUsers(w http.ResponseWriter, r *http.Request) {
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

	repo := repository.NewSettingsUserRepo(h.pool)
	users, err := repo.ListByOrg(r.Context(), orgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, users)
}

// ListUserRoles handles GET /dashboard/settings/users/{id}/roles
func (h *Handler) ListUserRoles(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	userID := chi.URLParam(r, "id")

	repo := repository.NewSettingsUserRepo(h.pool)
	roles, err := repo.ListUserRoles(r.Context(), userID, orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, roles)
}

// AssignUserRole handles POST /dashboard/settings/users/{id}/roles
func (h *Handler) AssignUserRole(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	userID := chi.URLParam(r, "id")

	var req assignRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RoleID == "" {
		Error(w, http.StatusBadRequest, "role_id is required")
		return
	}

	repo := repository.NewSettingsUserRepo(h.pool)
	ur, err := repo.AssignRole(r.Context(), userID, req.RoleID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user or role not found in org")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, ur)
}

// UnassignUserRole handles DELETE /dashboard/settings/users/{id}/roles/{roleId}
func (h *Handler) UnassignUserRole(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	userID := chi.URLParam(r, "id")
	roleID := chi.URLParam(r, "roleId")

	repo := repository.NewSettingsUserRepo(h.pool)
	err := repo.UnassignRole(r.Context(), userID, roleID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role assignment not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ============================================================
// Role handlers
// ============================================================

// ListMyRoles handles GET /dashboard/settings/roles
func (h *Handler) ListMyRoles(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	repo := repository.NewRoleRepo(h.pool)
	roles, err := repo.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, roles)
}

// CreateMyRole handles POST /dashboard/settings/roles
func (h *Handler) CreateMyRole(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req createRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}

	repo := repository.NewRoleRepo(h.pool)
	role, err := repo.Create(r.Context(), orgID, req.Name, req.Permissions)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, role)
}

// GetMyRole handles GET /dashboard/settings/roles/{id}
func (h *Handler) GetMyRole(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	id := chi.URLParam(r, "id")

	repo := repository.NewRoleRepo(h.pool)
	role, err := repo.Get(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, role)
}

// UpdateMyRole handles PATCH /dashboard/settings/roles/{id}
func (h *Handler) UpdateMyRole(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	id := chi.URLParam(r, "id")

	var req updateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewRoleRepo(h.pool)
	role, err := repo.Update(r.Context(), id, orgID, req.Name, req.Permissions)
	if err != nil {
		if errors.Is(err, repository.ErrSystemRole) {
			Error(w, http.StatusBadRequest, "cannot modify system role")
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, role)
}

// DeleteMyRole handles DELETE /dashboard/settings/roles/{id}
func (h *Handler) DeleteMyRole(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	id := chi.URLParam(r, "id")

	repo := repository.NewRoleRepo(h.pool)
	err := repo.Delete(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, repository.ErrSystemRole) {
			Error(w, http.StatusBadRequest, "cannot modify system role")
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ============================================================
// API key handlers
// ============================================================

// ListMyAPIKeys handles GET /dashboard/settings/api-keys
func (h *Handler) ListMyAPIKeys(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	repo := repository.NewAPIKeyRepo(h.pool)
	keys, err := repo.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, keys)
}

// CreateMyAPIKey handles POST /dashboard/settings/api-keys
func (h *Handler) CreateMyAPIKey(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req createAPIKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Scopes == nil {
		req.Scopes = []string{}
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			Error(w, http.StatusBadRequest, "expires_at must be RFC3339 format")
			return
		}
		expiresAt = &t
	}

	rawKey, keyHash, keyPrefix, err := crypto.GenerateAPIKey()
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewAPIKeyRepo(h.pool)
	key, err := repo.Create(r.Context(), orgID, req.Name, keyHash, keyPrefix, req.Scopes, expiresAt)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, createAPIKeyResponse{
		APIKey: key,
		Key:    rawKey,
	})
}

// DeleteMyAPIKey handles DELETE /dashboard/settings/api-keys/{id}
func (h *Handler) DeleteMyAPIKey(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	id := chi.URLParam(r, "id")

	repo := repository.NewAPIKeyRepo(h.pool)
	err := repo.Delete(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "api key not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}
