package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgListSSO(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	conns, err := h.sso.ListByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list SSO connections")
		return
	}
	JSON(w, http.StatusOK, conns)
}

func (h *Handler) OrgCreateSSO(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		Type            string  `json:"type"`
		DisplayName     string  `json:"display_name"`
		Enabled         bool    `json:"enabled"`
		OIDCIssuerURL   *string `json:"oidc_issuer_url"`
		OIDCClientID    *string `json:"oidc_client_id"`
		OIDCClientSecret *string `json:"oidc_client_secret"`
		OIDCScopes      *string `json:"oidc_scopes"`
		SAMLEntityID    *string `json:"saml_entity_id"`
		SAMLSSOURL      *string `json:"saml_sso_url"`
		SAMLCertificate *string `json:"saml_certificate"`
		SAMLMetadataURL *string `json:"saml_metadata_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" || body.DisplayName == "" {
		Error(w, http.StatusBadRequest, "type and display_name are required")
		return
	}

	conn := &domain.SSOConnection{
		OrgID:           session.OrgID,
		Type:            body.Type,
		DisplayName:     body.DisplayName,
		Enabled:         body.Enabled,
		OIDCIssuerURL:   body.OIDCIssuerURL,
		OIDCClientID:    body.OIDCClientID,
		OIDCScopes:      body.OIDCScopes,
		SAMLEntityID:    body.SAMLEntityID,
		SAMLSSOURL:      body.SAMLSSOURL,
		SAMLMetadataURL: body.SAMLMetadataURL,
	}

	if body.OIDCClientSecret != nil && *body.OIDCClientSecret != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.OIDCClientSecret)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		conn.OIDCClientSecretEnc = &enc
	}

	if body.SAMLCertificate != nil && *body.SAMLCertificate != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.SAMLCertificate)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		conn.SAMLCertificateEnc = &enc
	}

	result, err := h.sso.Create(ctx, conn)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create SSO connection")
		return
	}
	JSON(w, http.StatusCreated, result)
}

func (h *Handler) OrgUpdateSSO(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	existing, err := h.sso.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get SSO connection")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	var body struct {
		DisplayName     *string `json:"display_name"`
		Enabled         *bool   `json:"enabled"`
		OIDCIssuerURL   *string `json:"oidc_issuer_url"`
		OIDCClientID    *string `json:"oidc_client_id"`
		OIDCClientSecret *string `json:"oidc_client_secret"`
		OIDCScopes      *string `json:"oidc_scopes"`
		SAMLEntityID    *string `json:"saml_entity_id"`
		SAMLSSOURL      *string `json:"saml_sso_url"`
		SAMLCertificate *string `json:"saml_certificate"`
		SAMLMetadataURL *string `json:"saml_metadata_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Merge partial update into existing
	if body.DisplayName != nil {
		existing.DisplayName = *body.DisplayName
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}
	if body.OIDCIssuerURL != nil {
		existing.OIDCIssuerURL = body.OIDCIssuerURL
	}
	if body.OIDCClientID != nil {
		existing.OIDCClientID = body.OIDCClientID
	}
	if body.OIDCScopes != nil {
		existing.OIDCScopes = body.OIDCScopes
	}
	if body.SAMLEntityID != nil {
		existing.SAMLEntityID = body.SAMLEntityID
	}
	if body.SAMLSSOURL != nil {
		existing.SAMLSSOURL = body.SAMLSSOURL
	}
	if body.SAMLMetadataURL != nil {
		existing.SAMLMetadataURL = body.SAMLMetadataURL
	}

	if body.OIDCClientSecret != nil && *body.OIDCClientSecret != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.OIDCClientSecret)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		existing.OIDCClientSecretEnc = &enc
	}

	if body.SAMLCertificate != nil && *body.SAMLCertificate != "" {
		enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.SAMLCertificate)
		if err != nil {
			Error(w, http.StatusInternalServerError, "encryption failed")
			return
		}
		existing.SAMLCertificateEnc = &enc
	}

	result, err := h.sso.Update(ctx, existing)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update SSO connection")
		return
	}
	JSON(w, http.StatusOK, result)
}

func (h *Handler) OrgDeleteSSO(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	existing, err := h.sso.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get SSO connection")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	if err := h.sso.Delete(ctx, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete SSO connection")
		return
	}
	NoContent(w)
}
