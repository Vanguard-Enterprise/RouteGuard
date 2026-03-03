package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
)

// notFoundHash is a pre-computed bcrypt hash used on the "user not found" path
// to prevent email enumeration via timing side-channel.
var notFoundHash, _ = crypto.HashPassword("routeguard-dummy-for-timing-safety-do-not-use")

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	OrgSlug  string `json:"org_slug"`
}

// Login handles POST /auth/login.
// Staff users (no org_id) get IsStaff=true.
// Org users get IsStaff=false and their OrgID set.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email and password are required")
		return
	}

	userRepo := repository.NewUserRepo(h.pool)
	user, passwordHash, err := userRepo.FindByEmailAndProvider(r.Context(), req.Email, "password")
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Dummy comparison to prevent email enumeration via timing side-channel.
			_ = crypto.CheckPassword(req.Password, notFoundHash)
			Error(w, http.StatusUnauthorized, "invalid credentials")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	if err := crypto.CheckPassword(req.Password, passwordHash); err != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	permissions, err := userRepo.GetUserPermissions(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Enforce org/staff context to prevent cross-boundary authentication.
	isStaff := user.OrgID == nil
	if req.OrgSlug != "" {
		// Org portal: must be an org user belonging to the specified org.
		if isStaff {
			Error(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		orgRepo := repository.NewOrgRepo(h.pool)
		ok, err := orgRepo.CheckSlug(r.Context(), *user.OrgID, req.OrgSlug)
		if err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		if !ok {
			Error(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
	} else {
		// Staff portal: must be a staff user (no org).
		if !isStaff {
			Error(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
	}
	orgID := ""
	if user.OrgID != nil {
		orgID = *user.OrgID
	}

	payload := auth.SessionPayload{
		UserID:  user.ID,
		OrgID:   orgID,
		Email:   user.Email,
		Name:    user.Name,
		IsStaff: isStaff,
		Roles:   permissions,
	}

	token, err := auth.CreateSession(r.Context(), h.cache, payload)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Update last_login_at (non-fatal if it fails)
	_ = userRepo.UpdateLastLogin(r.Context(), user.ID)

	auth.SetSessionCookie(w, token, h.cfg.IsProd)
	JSON(w, http.StatusOK, map[string]any{
		"user_id":  user.ID,
		"email":    user.Email,
		"name":     user.Name,
		"is_staff": isStaff,
		"org_id":   orgID,
		"roles":    permissions,
	})
}

// Logout handles POST /auth/logout.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := auth.TokenFromRequest(r)
	if token != "" {
		_ = auth.DestroySession(r.Context(), h.cache, token)
	}
	auth.ClearSessionCookie(w)
	NoContent(w)
}

// Me handles GET /auth/me — returns the current session user.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	JSON(w, http.StatusOK, map[string]any{
		"user_id":  session.UserID,
		"email":    session.Email,
		"name":     session.Name,
		"is_staff": session.IsStaff,
		"org_id":   session.OrgID,
		"roles":    session.Roles,
	})
}
