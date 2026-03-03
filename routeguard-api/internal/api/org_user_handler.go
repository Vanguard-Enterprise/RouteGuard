package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/repository"
)

type orgUserResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	AvatarURL   *string `json:"avatar_url"`
	LastLoginAt *string `json:"last_login_at"`
	CreatedAt   string  `json:"created_at"`
}

// ListOrgUsersAdmin handles GET /admin/organizations/{id}/users
func (h *Handler) ListOrgUsersAdmin(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")

	orgRepo := repository.NewOrgRepo(h.pool)
	if _, err := orgRepo.Get(r.Context(), orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewOrgUserRepo(h.pool)
	users, err := repo.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp := make([]orgUserResponse, 0, len(users))
	for _, u := range users {
		our := orgUserResponse{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			AvatarURL: u.AvatarURL,
			CreatedAt: u.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
		if u.LastLoginAt != nil {
			s := u.LastLoginAt.Format("2006-01-02T15:04:05Z")
			our.LastLoginAt = &s
		}
		resp = append(resp, our)
	}
	JSON(w, http.StatusOK, resp)
}

// CreateOrgUserAdmin handles POST /admin/organizations/{id}/users
func (h *Handler) CreateOrgUserAdmin(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "name, email, and password are required")
		return
	}
	if len(req.Password) < 8 {
		Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	orgRepo := repository.NewOrgRepo(h.pool)
	if _, err := orgRepo.Get(r.Context(), orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewOrgUserRepo(h.pool)
	user, err := repo.CreateWithPasswordAndAdminRole(r.Context(), orgID, req.Email, req.Name, req.Password)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "a user with that email already exists in this organization")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp := orgUserResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		AvatarURL: user.AvatarURL,
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	JSON(w, http.StatusCreated, resp)
	h.LogAudit(r, "org_user.created", "user", user.ID, map[string]any{"org_id": orgID})
}
