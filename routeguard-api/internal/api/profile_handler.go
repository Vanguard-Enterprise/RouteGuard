package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

type updateProfileRequest struct {
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatar_url"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// profileResponse builds the JSON-serialisable map for a user, matching the
// frontend User interface (including the permissions field).
func profileResponse(user *domain.User, permissions []string) map[string]any {
	return map[string]any{
		"id":           user.ID,
		"org_id":       user.OrgID,
		"email":        user.Email,
		"name":         user.Name,
		"avatar_url":   user.AvatarURL,
		"last_login_at": user.LastLoginAt,
		"created_at":   user.CreatedAt,
		"permissions":  permissions,
	}
}

// GetAdminProfile handles GET /admin/profile.
// Returns the DB record for the currently authenticated staff user.
func (h *Handler) GetAdminProfile(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	repo := repository.NewUserRepo(h.pool)
	user, err := repo.FindByID(r.Context(), session.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	permissions, err := repo.GetUserPermissions(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, profileResponse(user, permissions))
}

// UpdateAdminProfile handles PATCH /admin/profile.
// Updates name and/or avatar_url; refreshes the Redis session so GET /auth/me stays consistent.
func (h *Handler) UpdateAdminProfile(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}

	repo := repository.NewUserRepo(h.pool)
	user, err := repo.UpdateProfile(r.Context(), session.UserID, req.Name, req.AvatarURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Refresh the session payload so GET /auth/me returns the updated name.
	// AvatarURL is intentionally not stored in SessionPayload - it is always read from the DB.
	token := auth.TokenFromRequest(r)
	if token != "" {
		updated := *session
		updated.Name = user.Name
		if err := auth.UpdateSession(r.Context(), h.cache, token, updated); err != nil {
			log.Warn().Err(err).Str("user_id", session.UserID).Msg("profile update: failed to refresh session in Redis")
		}
	}

	permissions, err := repo.GetUserPermissions(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, profileResponse(user, permissions))
}

// ChangeAdminPassword handles POST /admin/profile/password.
// Verifies the current password then replaces the hash.
func (h *Handler) ChangeAdminPassword(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		Error(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}
	if len(req.NewPassword) < 8 {
		Error(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}
	if len(req.CurrentPassword) > 72 || len(req.NewPassword) > 72 {
		Error(w, http.StatusBadRequest, "password must be 72 characters or fewer")
		return
	}

	repo := repository.NewUserRepo(h.pool)
	currentHash, err := repo.GetPasswordHash(r.Context(), session.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusBadRequest, "no password set for this account")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := crypto.CheckPassword(req.CurrentPassword, currentHash); err != nil {
		Error(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	newHash, err := crypto.HashPassword(req.NewPassword)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := repo.SetPasswordHash(r.Context(), session.UserID, newHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusBadRequest, "no password set for this account")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	NoContent(w)
}
