package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

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

func (h *Handler) buildEnrichedMember(ctx context.Context, membership *domain.OrgMembership) (*enrichedMember, error) {
	user, err := h.users.GetByID(ctx, membership.UserID)
	if err != nil {
		return nil, err
	}

	email, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
	name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)

	roles, err := h.roles.ListMemberRoles(ctx, membership.ID)
	if err != nil {
		return nil, err
	}

	memberRoles := make([]memberRole, 0, len(roles))
	for _, role := range roles {
		memberRoles = append(memberRoles, memberRole{ID: role.ID, Name: role.Name})
	}

	return &enrichedMember{
		UserID: membership.UserID,
		Email:  email,
		Name:   name,
		Roles:  memberRoles,
	}, nil
}

func (h *Handler) OrgListMembers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	memberships, err := h.members.ListMembersByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list members")
		return
	}

	result := make([]enrichedMember, 0, len(memberships))
	for _, m := range memberships {
		member, err := h.buildEnrichedMember(ctx, &m)
		if err != nil {
			continue
		}
		result = append(result, *member)
	}

	JSON(w, http.StatusOK, result)
}

func (h *Handler) OrgCreateMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Email = normalizeEmail(body.Email)
	body.Name = normalizeName(body.Name)
	if body.Email == "" || body.Name == "" {
		Error(w, http.StatusBadRequest, "email and name are required")
		return
	}

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

	user, err := h.users.Create(ctx, emailEnc, emailHash, nameEnc, nil)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "a user with this email already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	membership, err := h.members.Create(ctx, user.ID, session.OrgID)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "user already a member")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to add member")
		return
	}
	member, err := h.buildEnrichedMember(ctx, membership)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load member")
		return
	}
	JSON(w, http.StatusCreated, member)
}

func (h *Handler) OrgInviteMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Email = normalizeEmail(body.Email)
	if body.Email == "" {
		Error(w, http.StatusBadRequest, "email is required")
		return
	}

	emailHash := crypto.HMAC(h.cfg.HMACKey, body.Email)
	user, err := h.users.GetByEmailHash(ctx, emailHash)
	if err != nil {
		if isNotFound(err) {
			// User does not exist - create placeholder
			emailEnc, encErr := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Email)
			if encErr != nil {
				Error(w, http.StatusInternalServerError, "encryption failed")
				return
			}
			nameEnc, encErr := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Email)
			if encErr != nil {
				Error(w, http.StatusInternalServerError, "encryption failed")
				return
			}
			user, err = h.users.Create(ctx, emailEnc, emailHash, nameEnc, nil)
			if err != nil {
				if isUniqueViolation(err) {
					Error(w, http.StatusConflict, "a user with this email already exists")
					return
				}
				Error(w, http.StatusInternalServerError, "failed to create user")
				return
			}
		} else {
			Error(w, http.StatusInternalServerError, "failed to look up user")
			return
		}
	}

	_, err = h.members.Create(ctx, user.ID, session.OrgID)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "user already a member")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgRemoveMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	userID := chi.URLParam(r, "userId")

	membership, err := h.members.GetByUserAndOrg(ctx, userID, session.OrgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	if err := h.ensureCriticalPermissionsRetained(ctx, session.OrgID, userID, nil); err != nil {
		Error(w, http.StatusConflict, err.Error())
		return
	}

	if err := h.members.Delete(ctx, membership.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	NoContent(w)
}

func (h *Handler) OrgUpdateMemberRoles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	userID := chi.URLParam(r, "userId")

	var body struct {
		RoleIDs []string `json:"role_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	roleIDs, targetPermissions, err := h.validateRoleAssignments(ctx, session.OrgID, body.RoleIDs)
	if err != nil {
		if errors.Is(err, errInvalidRoleAssignment) {
			Error(w, http.StatusBadRequest, "role assignment contains a role outside this organization")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to validate roles")
		return
	}

	membership, err := h.members.GetByUserAndOrg(ctx, userID, session.OrgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	if err := h.ensureCriticalPermissionsRetained(ctx, session.OrgID, userID, targetPermissions); err != nil {
		Error(w, http.StatusConflict, err.Error())
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
	for _, roleID := range roleIDs {
		if err := h.roles.AssignToMember(ctx, membership.ID, roleID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to assign role")
			return
		}
	}

	NoContent(w)
}

func (h *Handler) OrgListRoles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	roles, err := h.roles.ListByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list roles")
		return
	}
	JSON(w, http.StatusOK, roles)
}
