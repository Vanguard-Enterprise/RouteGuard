package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

func (h *Handler) PlatformCreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email           string  `json:"email"`
		Name            string  `json:"name"`
		OrgID           *string `json:"org_id"`
		DeliveryMethod  string  `json:"delivery_method"`
		InitialPassword string  `json:"initial_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Email = normalizeEmail(body.Email)
	body.Name = normalizeName(body.Name)
	body.DeliveryMethod = strings.TrimSpace(body.DeliveryMethod)
	if body.Email == "" || body.Name == "" {
		Error(w, http.StatusBadRequest, "email and name are required")
		return
	}
	if body.DeliveryMethod == "" {
		body.DeliveryMethod = "none"
	}
	switch body.DeliveryMethod {
	case "none", "email", "magic_link", "password":
	default:
		Error(w, http.StatusBadRequest, "invalid delivery method")
		return
	}
	if body.DeliveryMethod == "password" {
		if strings.TrimSpace(body.InitialPassword) == "" {
			Error(w, http.StatusBadRequest, "initial password is required")
			return
		}
		if len(body.InitialPassword) < 8 {
			Error(w, http.StatusBadRequest, "initial password must be at least 8 characters")
			return
		}
	} else if strings.TrimSpace(body.InitialPassword) != "" {
		Error(w, http.StatusBadRequest, "initial password is only allowed for password delivery")
		return
	}
	if (body.DeliveryMethod == "email" || body.DeliveryMethod == "magic_link") && (body.OrgID == nil || strings.TrimSpace(*body.OrgID) == "") {
		Error(w, http.StatusBadRequest, "org_id is required for email and magic link delivery")
		return
	}

	ctx := r.Context()
	emailEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}
	nameEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}
	emailHash := crypto.HMAC(h.cfg.HMACKey, body.Email)

	var passwordHash *string
	if body.DeliveryMethod == "password" {
		hash, hashErr := bcrypt.GenerateFromPassword([]byte(body.InitialPassword), bcrypt.DefaultCost)
		if hashErr != nil {
			Error(w, http.StatusInternalServerError, "failed to hash password")
			return
		}
		hashStr := string(hash)
		passwordHash = &hashStr
	}

	user, err := h.users.Create(ctx, emailEnc, emailHash, nameEnc, passwordHash)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "a user with this email already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if body.OrgID != nil && *body.OrgID != "" {
		if _, err := h.members.Create(ctx, user.ID, *body.OrgID); err != nil {
			if isUniqueViolation(err) {
				Error(w, http.StatusConflict, "user already a member")
				return
			}
			Error(w, http.StatusInternalServerError, "failed to add member")
			return
		}
	}

	var magicLinkURL *string
	if body.DeliveryMethod == "email" || body.DeliveryMethod == "magic_link" {
		token, tokenErr := auth.GenerateToken(32)
		if tokenErr != nil {
			Error(w, http.StatusInternalServerError, "failed to create magic link")
			return
		}
		payload := magicLinkPayload{
			UserID: user.ID,
			OrgID:  *body.OrgID,
		}
		if err := h.cache.Set(ctx, magicLinkCacheKey(token), payload, magicLinkTTL); err != nil {
			Error(w, http.StatusInternalServerError, "failed to store magic link")
			return
		}
		link := buildMagicLinkURL(h.cfg.BaseURL, token)
		magicLinkURL = &link
	}

	user.Email = body.Email
	user.Name = body.Name
	JSON(w, http.StatusCreated, map[string]any{
		"id":             user.ID,
		"email":          user.Email,
		"name":           user.Name,
		"disabled_at":    user.DisabledAt,
		"last_login_at":  user.LastLoginAt,
		"created_at":     user.CreatedAt,
		"updated_at":     user.UpdatedAt,
		"magic_link_url": magicLinkURL,
	})
}

func (h *Handler) PlatformListUsers(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	var emailHash string
	if email != "" {
		emailHash = crypto.HMAC(h.cfg.HMACKey, email)
	}

	items, total, err := h.users.ListPaginated(r.Context(), emailHash, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	for i := range items {
		items[i].Email, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, items[i].EmailEnc)
		items[i].Name, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, items[i].NameEnc)
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.User]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) PlatformGetUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	user, err := h.users.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "user not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	user.Email, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
	user.Name, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)

	orgs, err := h.members.ListOrgsByUser(ctx, id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list memberships")
		return
	}

	var memberships []domain.UserOrgMembership
	for _, org := range orgs {
		membership, _ := h.members.GetByUserAndOrg(ctx, id, org.ID)
		var roles []domain.OrgRole
		if membership != nil {
			roles, _ = h.roles.ListMemberRoles(ctx, membership.ID)
		}
		h.decryptOrgName(&org)
		memberships = append(memberships, domain.UserOrgMembership{
			OrgID:   org.ID,
			OrgName: org.Name,
			OrgSlug: org.Slug,
			Roles:   roles,
		})
	}

	JSON(w, http.StatusOK, domain.UserDetail{
		User:        *user,
		Memberships: memberships,
	})
}

func (h *Handler) PlatformDisableUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.users.Disable(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to disable user")
		return
	}
	h.cache.Del(r.Context(), "user_enabled:"+id)
	auth.InvalidateUserSessions(r.Context(), h.cache, id)
	NoContent(w)
}

func (h *Handler) PlatformEnableUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.users.Enable(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to enable user")
		return
	}
	h.cache.Del(r.Context(), "user_enabled:"+id)
	NoContent(w)
}

func (h *Handler) PlatformResetPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.pool.Exec(r.Context(),
		`UPDATE users SET password_hash = NULL, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to reset password")
		return
	}
	auth.InvalidateUserSessions(r.Context(), h.cache, id)
	NoContent(w)
}

func (h *Handler) PlatformRevokeSessions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := auth.InvalidateUserSessions(r.Context(), h.cache, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to revoke sessions")
		return
	}
	NoContent(w)
}
