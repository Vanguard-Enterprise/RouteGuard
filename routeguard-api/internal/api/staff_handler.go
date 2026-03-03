package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

// ============================================================
// Staff Users
// ============================================================

type staffUserResponse struct {
	ID              string              `json:"id"`
	Email           string              `json:"email"`
	Name            string              `json:"name"`
	AvatarURL       *string             `json:"avatar_url"`
	LastLoginAt     *string             `json:"last_login_at"`
	DeletedAt       *string             `json:"deleted_at"`
	DaysUntilDelete int                 `json:"days_until_deletion"`
	Roles           []staffRoleResponse `json:"roles"`
	CreatedAt       string              `json:"created_at"`
}

type staffRoleResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
	IsSystem    bool     `json:"is_system"`
}

// ListStaffUsers handles GET /admin/staff/users
func (h *Handler) ListStaffUsers(w http.ResponseWriter, r *http.Request) {
	userRepo := repository.NewStaffUserRepo(h.pool)
	roleRepo := repository.NewStaffRoleRepo(h.pool)

	users, err := userRepo.ListStaffUsers(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp := make([]staffUserResponse, 0, len(users))
	for _, u := range users {
		roles, err := roleRepo.ListUserStaffRoles(r.Context(), u.ID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		roleResps := make([]staffRoleResponse, 0, len(roles))
		for _, role := range roles {
			roleResps = append(roleResps, staffRoleResponse{
				ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
			})
		}
		sur := staffUserResponse{
			ID:              u.ID,
			Email:           u.Email,
			Name:            u.Name,
			AvatarURL:       u.AvatarURL,
			Roles:           roleResps,
			DaysUntilDelete: repository.DaysUntilDeletion(u.DeletedAt),
			CreatedAt:       u.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
		if u.LastLoginAt != nil {
			s := u.LastLoginAt.Format("2006-01-02T15:04:05Z")
			sur.LastLoginAt = &s
		}
		if u.DeletedAt != nil {
			s := u.DeletedAt.Format("2006-01-02T15:04:05Z")
			sur.DeletedAt = &s
		}
		resp = append(resp, sur)
	}
	JSON(w, http.StatusOK, resp)
}

// CreateStaffUser handles POST /admin/staff/users
func (h *Handler) CreateStaffUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Name == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email, name, and password are required")
		return
	}
	if len(req.Password) < 8 {
		Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	userRepo := repository.NewStaffUserRepo(h.pool)
	user, err := userRepo.CreateStaffUser(r.Context(), req.Email, req.Name, req.Password)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, staffUserResponse{
		ID: user.ID, Email: user.Email, Name: user.Name, Roles: []staffRoleResponse{},
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// GetStaffUser handles GET /admin/staff/users/{id}
func (h *Handler) GetStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userRepo := repository.NewStaffUserRepo(h.pool)
	roleRepo := repository.NewStaffRoleRepo(h.pool)

	user, err := userRepo.GetStaffUser(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	roles, err := roleRepo.ListUserStaffRoles(r.Context(), id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	roleResps := make([]staffRoleResponse, 0, len(roles))
	for _, role := range roles {
		roleResps = append(roleResps, staffRoleResponse{
			ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
		})
	}
	sur := staffUserResponse{
		ID: user.ID, Email: user.Email, Name: user.Name, AvatarURL: user.AvatarURL,
		Roles: roleResps, DaysUntilDelete: repository.DaysUntilDeletion(user.DeletedAt),
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if user.LastLoginAt != nil {
		s := user.LastLoginAt.Format("2006-01-02T15:04:05Z")
		sur.LastLoginAt = &s
	}
	if user.DeletedAt != nil {
		s := user.DeletedAt.Format("2006-01-02T15:04:05Z")
		sur.DeletedAt = &s
	}
	JSON(w, http.StatusOK, sur)
}

// UpdateStaffUser handles PATCH /admin/staff/users/{id}
func (h *Handler) UpdateStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	userRepo := repository.NewStaffUserRepo(h.pool)
	user, err := userRepo.UpdateStaffUser(r.Context(), id, req.Name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	JSON(w, http.StatusOK, staffUserResponse{
		ID: user.ID, Email: user.Email, Name: user.Name,
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// DeleteStaffUser handles DELETE /admin/staff/users/{id} (soft delete)
func (h *Handler) DeleteStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Prevent self-deletion
	session := auth.SessionFromContext(r.Context())
	if session != nil && session.UserID == id {
		Error(w, http.StatusBadRequest, "cannot delete your own account")
		return
	}

	userRepo := repository.NewStaffUserRepo(h.pool)
	if err := userRepo.SoftDeleteStaffUser(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	// Invalidate all sessions for this user immediately.
	_ = auth.InvalidateUserSessions(r.Context(), h.cache, id)
	NoContent(w)
}

// RestoreStaffUser handles POST /admin/staff/users/{id}/restore
func (h *Handler) RestoreStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userRepo := repository.NewStaffUserRepo(h.pool)
	if err := userRepo.RestoreStaffUser(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found or not deleted")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	NoContent(w)
}

// ListStaffUserRoles handles GET /admin/staff/users/{id}/roles
func (h *Handler) ListStaffUserRoles(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	roles, err := roleRepo.ListUserStaffRoles(r.Context(), id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	resp := make([]staffRoleResponse, 0, len(roles))
	for _, role := range roles {
		resp = append(resp, staffRoleResponse{
			ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
		})
	}
	JSON(w, http.StatusOK, resp)
}

// AssignStaffUserRole handles POST /admin/staff/users/{id}/roles
func (h *Handler) AssignStaffUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	var req struct {
		RoleID string `json:"role_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RoleID == "" {
		Error(w, http.StatusBadRequest, "role_id is required")
		return
	}
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	if err := roleRepo.AssignStaffRole(r.Context(), userID, req.RoleID); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// UnassignStaffUserRole handles DELETE /admin/staff/users/{id}/roles/{roleId}
func (h *Handler) UnassignStaffUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	roleID := chi.URLParam(r, "roleId")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	if err := roleRepo.UnassignStaffRole(r.Context(), userID, roleID); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ============================================================
// Staff Roles
// ============================================================

// ListStaffRoles handles GET /admin/staff/roles
func (h *Handler) ListStaffRoles(w http.ResponseWriter, r *http.Request) {
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	roles, err := roleRepo.ListStaffRoles(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	resp := make([]staffRoleResponse, 0, len(roles))
	for _, role := range roles {
		resp = append(resp, staffRoleResponse{
			ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
		})
	}
	JSON(w, http.StatusOK, resp)
}

// CreateStaffRole handles POST /admin/staff/roles
func (h *Handler) CreateStaffRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
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
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	role, err := roleRepo.CreateStaffRole(r.Context(), req.Name, req.Permissions)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, staffRoleResponse{
		ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
	})
}

// GetStaffRole handles GET /admin/staff/roles/{id}
func (h *Handler) GetStaffRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	role, err := roleRepo.GetStaffRole(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	JSON(w, http.StatusOK, staffRoleResponse{
		ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
	})
}

// UpdateStaffRole handles PATCH /admin/staff/roles/{id}
func (h *Handler) UpdateStaffRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
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
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	role, err := roleRepo.UpdateStaffRole(r.Context(), id, req.Name, req.Permissions)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found or is a system role")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	JSON(w, http.StatusOK, staffRoleResponse{
		ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
	})
}

// DeleteStaffRole handles DELETE /admin/staff/roles/{id}
func (h *Handler) DeleteStaffRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	if err := roleRepo.DeleteStaffRole(r.Context(), id); err != nil {
		if err.Error() == "role not found or is a system role" {
			Error(w, http.StatusNotFound, "role not found or is a system role")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	NoContent(w)
}
