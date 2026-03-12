package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgListIntegrations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	items, err := h.integrations.ListByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list integrations")
		return
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) OrgCreateIntegration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		Type        string `json:"type"`
		DisplayName string `json:"display_name"`
		BaseURL     string `json:"base_url"`
		APIKey      string `json:"api_key"`
		APISecret   string `json:"api_secret"`
		Enabled     bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" || body.DisplayName == "" {
		Error(w, http.StatusBadRequest, "type and display_name are required")
		return
	}

	intg := &domain.Integration{
		OrgID:       session.OrgID,
		Type:        body.Type,
		DisplayName: body.DisplayName,
		BaseURL:     body.BaseURL,
		Enabled:     body.Enabled,
	}

	if body.APIKey != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.APIKey)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		intg.APIKeyEnc = enc
	}

	if body.APISecret != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.APISecret)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		intg.APISecretEnc = enc
	}

	result, err := h.integrations.Create(ctx, intg)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create integration")
		return
	}
	JSON(w, http.StatusCreated, result)
}

func (h *Handler) OrgUpdateIntegration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	existing, err := h.integrations.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "integration not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get integration")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "integration not found")
		return
	}

	var body struct {
		DisplayName *string `json:"display_name"`
		BaseURL     *string `json:"base_url"`
		APIKey      *string `json:"api_key"`
		APISecret   *string `json:"api_secret"`
		Enabled     *bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.DisplayName != nil {
		existing.DisplayName = *body.DisplayName
	}
	if body.BaseURL != nil {
		existing.BaseURL = *body.BaseURL
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}

	if body.APIKey != nil && *body.APIKey != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.APIKey)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		existing.APIKeyEnc = enc
	}

	if body.APISecret != nil && *body.APISecret != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.APISecret)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		existing.APISecretEnc = enc
	}

	result, err := h.integrations.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "integration not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update integration")
		return
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) OrgDeleteIntegration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	existing, err := h.integrations.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "integration not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get integration")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "integration not found")
		return
	}

	if err := h.integrations.Delete(ctx, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete integration")
		return
	}
	NoContent(w)
}
