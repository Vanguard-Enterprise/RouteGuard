package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgListMembers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	memberships, err := h.members.ListMembersByOrg(ctx, session.OrgID)
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
		for _, role := range roles {
			memberRoles = append(memberRoles, memberRole{ID: role.ID, Name: role.Name})
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
	JSON(w, http.StatusCreated, membership)
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

	// Guard: block removal of last org:manage member.
	allMemberships, err := h.members.ListMembersByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list members")
		return
	}

	adminCount := 0
	for _, m := range allMemberships {
		if m.UserID == userID {
			continue
		}
		perms, _ := h.members.GetUserPermissions(ctx, m.UserID, session.OrgID)
		for _, p := range perms {
			if p == "org:manage" {
				adminCount++
				break
			}
		}
	}

	// Check whether the target user has org:manage
	targetPerms, _ := h.members.GetUserPermissions(ctx, userID, session.OrgID)
	targetIsAdmin := false
	for _, p := range targetPerms {
		if p == "org:manage" {
			targetIsAdmin = true
			break
		}
	}

	if targetIsAdmin && adminCount == 0 {
		Error(w, http.StatusConflict, "cannot remove the last org:manage member")
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

	membership, err := h.members.GetByUserAndOrg(ctx, userID, session.OrgID)
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
