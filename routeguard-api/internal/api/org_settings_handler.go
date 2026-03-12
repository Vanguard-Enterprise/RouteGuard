package api

import (
	"encoding/json"
	"net/http"

	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgGetSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	org, err := h.orgs.GetByID(ctx, session.OrgID)
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

func (h *Handler) OrgUpdateSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}

	current, err := h.orgs.GetByID(ctx, session.OrgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get org")
		return
	}

	nameEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}

	org, err := h.orgs.Update(ctx, session.OrgID, nameEnc, current.Slug)
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
