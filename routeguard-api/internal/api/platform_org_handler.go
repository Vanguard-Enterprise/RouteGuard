package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

// actorEmail gets the current user's decrypted email for audit logging.
func (h *Handler) actorEmail(ctx context.Context, userID string) string {
	u, err := h.users.GetByID(ctx, userID)
	if err != nil {
		return "unknown"
	}
	email, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, u.EmailEnc)
	return email
}

// decryptOrgName decrypts the org name from NameEnc field.
func (h *Handler) decryptOrgName(org *domain.Organization) {
	if org.NameEnc != "" {
		org.Name, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)
	}
}

func (h *Handler) PlatformListOrgs(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.orgs.ListPaginated(r.Context(), search, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list orgs")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	for i := range items {
		h.decryptOrgName(&items[i])
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Organization]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) PlatformCreateOrg(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" || body.Slug == "" {
		Error(w, http.StatusBadRequest, "name and slug are required")
		return
	}

	ctx := r.Context()
	nameEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}

	org, err := h.orgs.Create(ctx, nameEnc, body.Slug)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "slug already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create org")
		return
	}

	if err := h.orgs.SeedSystemRoles(ctx, org.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to seed roles")
		return
	}

	_, _ = h.billing.GetOrCreateByOrg(ctx, org.ID)

	// Audit
	session := middleware.SessionFromContext(ctx)
	meta, _ := json.Marshal(map[string]string{"name": body.Name, "slug": body.Slug})
	h.audit.Create(ctx, domain.AuditEvent{
		ActorID:    session.UserID,
		ActorEmail: h.actorEmail(ctx, session.UserID),
		EventType:  "org.created",
		TargetType: "organization",
		TargetID:   &org.ID,
		Metadata:   meta,
	})

	org.Name = body.Name
	JSON(w, http.StatusCreated, org)
}

func (h *Handler) PlatformGetOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	org, err := h.orgs.GetByID(r.Context(), id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get org")
		return
	}
	h.decryptOrgName(org)
	JSON(w, http.StatusOK, org)
}

func (h *Handler) PlatformUpdateOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	nameEnc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	org, err := h.orgs.Update(r.Context(), id, nameEnc, body.Slug)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update org")
		return
	}
	org.Name = body.Name
	JSON(w, http.StatusOK, org)
}

func (h *Handler) PlatformSuspendOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.orgs.Suspend(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to suspend org")
		return
	}
	h.cache.Del(r.Context(), "org_accessible:"+id)
	NoContent(w)
}

func (h *Handler) PlatformReactivateOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.orgs.Reactivate(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to reactivate org")
		return
	}
	h.cache.Del(r.Context(), "org_accessible:"+id)
	NoContent(w)
}

func (h *Handler) PlatformDeleteOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.orgs.SoftDelete(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete org")
		return
	}
	h.cache.Del(r.Context(), "org_accessible:"+id)
	NoContent(w)
}

func (h *Handler) PlatformListOrgMembers(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	ctx := r.Context()

	memberships, err := h.members.ListMembersByOrg(ctx, orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list members")
		return
	}

	type memberRole struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	type enrichedMember struct {
		UserID string       `json:"user_id"`
		Email  string       `json:"email"`
		Name   string       `json:"name"`
		Roles  []memberRole `json:"roles"`
	}

	result := make([]enrichedMember, 0, len(memberships))
	for _, m := range memberships {
		user, err := h.users.GetByID(ctx, m.UserID)
		if err != nil {
			continue
		}
		email, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
		name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)

		roles, _ := h.roles.ListMemberRoles(ctx, m.ID)
		memberRoles := make([]memberRole, 0, len(roles))
		for _, r := range roles {
			memberRoles = append(memberRoles, memberRole{ID: r.ID, Name: r.Name})
		}

		result = append(result, enrichedMember{
			UserID: m.UserID,
			Email:  email,
			Name:   name,
			Roles:  memberRoles,
		})
	}

	JSON(w, http.StatusOK, result)
}

func (h *Handler) PlatformAddOrgMember(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	membership, err := h.members.Create(r.Context(), body.UserID, orgID)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "user already a member")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to add member")
		return
	}
	JSON(w, http.StatusCreated, membership)
}

func (h *Handler) PlatformRemoveOrgMember(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")

	membership, err := h.members.GetByUserAndOrg(r.Context(), userID, orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	if err := h.members.Delete(r.Context(), membership.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	NoContent(w)
}

func (h *Handler) PlatformUpdateMemberRoles(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")

	var body struct {
		RoleIDs []string `json:"role_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	membership, err := h.members.GetByUserAndOrg(ctx, userID, orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	existingRoles, err := h.roles.ListMemberRoles(ctx, membership.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list current roles")
		return
	}
	for _, role := range existingRoles {
		if err := h.roles.UnassignFromMember(ctx, membership.ID, role.ID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to unassign role")
			return
		}
	}
	for _, roleID := range body.RoleIDs {
		if err := h.roles.AssignToMember(ctx, membership.ID, roleID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to assign role")
			return
		}
	}

	NoContent(w)
}
