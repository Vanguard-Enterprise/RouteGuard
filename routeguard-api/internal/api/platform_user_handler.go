package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

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
