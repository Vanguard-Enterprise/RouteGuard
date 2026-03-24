package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

type lookupRequest struct {
	Email string `json:"email"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type magicLinkConsumeRequest struct {
	Token string `json:"token"`
}

type loginResponse struct {
	User loginUser   `json:"user"`
	Orgs []orgOption `json:"orgs"`
}

type loginUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type orgOption struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPlatform bool   `json:"is_platform"`
}

// Lookup returns available auth methods for an email address.
func (h *Handler) Lookup(w http.ResponseWriter, r *http.Request) {
	var req lookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		Error(w, http.StatusBadRequest, "email is required")
		return
	}

	emailHash := crypto.HMAC(h.cfg.HMACKey, email)
	user, err := h.users.GetByEmailHash(r.Context(), emailHash)

	resp := domain.AuthMethodsResponse{}

	if err != nil {
		// User not found - return empty methods (don't reveal if email exists for SSO)
		JSON(w, http.StatusOK, resp)
		return
	}

	resp.HasPassword = user.PasswordHash != nil

	// Find SSO options from orgs the user belongs to
	ssoConns, err := h.sso.ListEnabledByUserOrgs(r.Context(), user.ID)
	if err == nil {
		for _, conn := range ssoConns {
			org, err := h.orgs.GetByID(r.Context(), conn.OrgID)
			if err != nil {
				continue
			}
			orgName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)
			resp.SSOOptions = append(resp.SSOOptions, domain.SSOOptionPublic{
				ConnectionID: conn.ID,
				Type:         conn.Type,
				DisplayName:  conn.DisplayName,
				OrgSlug:      org.Slug,
				OrgName:      orgName,
			})
		}
	}

	JSON(w, http.StatusOK, resp)
}

// Login authenticates with email + password.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email and password are required")
		return
	}

	emailHash := crypto.HMAC(h.cfg.HMACKey, email)
	user, err := h.users.GetByEmailHash(r.Context(), emailHash)
	if err != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if user.PasswordHash == nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Track last login time (best effort)
	_, _ = h.pool.Exec(r.Context(), `UPDATE users SET last_login_at = now() WHERE id = $1`, user.ID)

	// Get user's orgs
	orgs, err := h.members.ListOrgsByUser(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organizations")
		return
	}

	if len(orgs) == 0 {
		Error(w, http.StatusForbidden, "no organization membership")
		return
	}

	// Auto-select first org
	selectedOrg := orgs[0]

	// Load permissions for selected org
	perms, err := h.members.GetUserPermissions(r.Context(), user.ID, selectedOrg.ID)
	if err != nil {
		perms = []string{}
	}

	// Create session
	payload := &domain.SessionPayload{
		UserID:      user.ID,
		OrgID:       selectedOrg.ID,
		HomeOrgID:   selectedOrg.ID,
		Permissions: perms,
	}

	token, err := auth.CreateSession(r.Context(), h.cache, payload)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Set cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "rg_session",
		Value:    token,
		Path:     "/",
		MaxAge:   int(auth.SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.IsProd,
		SameSite: http.SameSiteLaxMode,
	})

	// Decrypt user fields for response
	decryptedEmail, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
	decryptedName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)

	orgOptions := make([]orgOption, len(orgs))
	for i, o := range orgs {
		name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, o.NameEnc)
		orgOptions[i] = orgOption{
			ID:         o.ID,
			Name:       name,
			Slug:       o.Slug,
			IsPlatform: o.IsPlatform,
		}
	}

	JSON(w, http.StatusOK, loginResponse{
		User: loginUser{
			ID:    user.ID,
			Email: decryptedEmail,
			Name:  decryptedName,
		},
		Orgs: orgOptions,
	})
}

// ConsumeMagicLink authenticates with a one-time onboarding link.
func (h *Handler) ConsumeMagicLink(w http.ResponseWriter, r *http.Request) {
	var req magicLinkConsumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		Error(w, http.StatusBadRequest, "token is required")
		return
	}

	var payload magicLinkPayload
	if err := h.cache.GetDel(r.Context(), magicLinkCacheKey(req.Token), &payload); err != nil {
		if h.cache.IsNotFound(err) {
			Error(w, http.StatusUnauthorized, "magic link is invalid or expired")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to consume magic link")
		return
	}

	user, err := h.users.GetByID(r.Context(), payload.UserID)
	if err != nil {
		Error(w, http.StatusUnauthorized, "magic link is invalid or expired")
		return
	}
	if user.DisabledAt != nil {
		Error(w, http.StatusForbidden, "user is disabled")
		return
	}
	if _, err := h.members.GetByUserAndOrg(r.Context(), payload.UserID, payload.OrgID); err != nil {
		Error(w, http.StatusForbidden, "user is not a member of this organization")
		return
	}

	perms, err := h.members.GetUserPermissions(r.Context(), payload.UserID, payload.OrgID)
	if err != nil {
		perms = []string{}
	}

	session := &domain.SessionPayload{
		UserID:      payload.UserID,
		OrgID:       payload.OrgID,
		HomeOrgID:   payload.OrgID,
		Permissions: perms,
	}

	token, err := auth.CreateSession(r.Context(), h.cache, session)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "rg_session",
		Value:    token,
		Path:     "/",
		MaxAge:   int(auth.SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.IsProd,
		SameSite: http.SameSiteLaxMode,
	})

	_, _ = h.pool.Exec(r.Context(), `UPDATE users SET last_login_at = now() WHERE id = $1`, payload.UserID)

	NoContent(w)
}

// Logout destroys the session.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := middleware.TokenFromContext(r.Context())
	if token != "" {
		_ = auth.DeleteSession(r.Context(), h.cache, token)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "rg_session",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.IsProd,
		SameSite: http.SameSiteLaxMode,
	})

	NoContent(w)
}

// Me returns the current user, active org, and permissions.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.users.GetByID(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	org, err := h.orgs.GetByID(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organization")
		return
	}

	decryptedEmail, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
	decryptedName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)
	orgName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)

	JSON(w, http.StatusOK, domain.MeResponse{
		User: domain.User{
			ID:        user.ID,
			Email:     decryptedEmail,
			Name:      decryptedName,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		},
		ActiveOrg: domain.OrgSummary{
			ID:         org.ID,
			Name:       orgName,
			Slug:       org.Slug,
			IsPlatform: org.IsPlatform,
		},
		HomeOrgID:   session.HomeOrgID,
		Permissions: session.Permissions,
	})
}

// SwitchOrg changes the active org in the session.
func (h *Handler) SwitchOrg(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	token := middleware.TokenFromContext(r.Context())

	var req struct {
		OrgID string `json:"org_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.OrgID == "" {
		Error(w, http.StatusBadRequest, "org_id is required")
		return
	}

	// Verify membership
	_, err := h.members.GetByUserAndOrg(r.Context(), session.UserID, req.OrgID)
	if err != nil {
		Error(w, http.StatusForbidden, "not a member of this organization")
		return
	}
	accessible, err := h.orgs.IsOrgAccessible(r.Context(), req.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to verify organization access")
		return
	}
	if !accessible {
		Error(w, http.StatusForbidden, "organization is unavailable")
		return
	}

	// Load permissions for new org
	perms, err := h.members.GetUserPermissions(r.Context(), session.UserID, req.OrgID)
	if err != nil {
		perms = []string{}
	}

	// Update session
	session.OrgID = req.OrgID
	session.Permissions = perms

	if err := auth.UpdateSession(r.Context(), h.cache, token, session); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update session")
		return
	}

	org, err := h.orgs.GetByID(r.Context(), req.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organization")
		return
	}

	orgName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)

	JSON(w, http.StatusOK, map[string]any{
		"org": domain.OrgSummary{
			ID:         org.ID,
			Name:       orgName,
			Slug:       org.Slug,
			IsPlatform: org.IsPlatform,
		},
		"permissions": perms,
	})
}

// ListMyOrgs returns all orgs the current user belongs to.
func (h *Handler) ListMyOrgs(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())

	orgs, err := h.members.ListOrgsByUser(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organizations")
		return
	}

	result := make([]orgOption, len(orgs))
	for i, o := range orgs {
		name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, o.NameEnc)
		result[i] = orgOption{
			ID:         o.ID,
			Name:       name,
			Slug:       o.Slug,
			IsPlatform: o.IsPlatform,
		}
	}

	JSON(w, http.StatusOK, result)
}
