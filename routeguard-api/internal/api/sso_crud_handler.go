package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

// ssoResponse wraps domain.SSOConnection for API responses, replacing encrypted
// secret fields with boolean presence indicators.
type ssoResponse struct {
	ID              string  `json:"id"`
	OrgID           string  `json:"org_id"`
	Type            string  `json:"type"`
	DisplayName     string  `json:"display_name"`
	Domain          string  `json:"domain"`
	Enabled         bool    `json:"enabled"`
	OIDCIssuerURL   *string `json:"oidc_issuer_url"`
	OIDCClientID    *string `json:"oidc_client_id"`
	HasOIDCSecret   bool    `json:"has_oidc_secret"`
	OIDCScopes      string  `json:"oidc_scopes"`
	SAMLEntityID    *string `json:"saml_entity_id"`
	SAMLSSOUrl      *string `json:"saml_sso_url"`
	HasSAMLCert     bool    `json:"has_saml_certificate"`
	SAMLMetadataURL *string `json:"saml_metadata_url"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func toSSOResponse(c *domain.SSOConnection) ssoResponse {
	return ssoResponse{
		ID:            c.ID,
		OrgID:         c.OrgID,
		Type:          c.Type,
		DisplayName:   c.DisplayName,
		Domain:        c.Domain,
		Enabled:       c.Enabled,
		OIDCIssuerURL: c.OIDCIssuerURL,
		OIDCClientID:  c.OIDCClientID,
		HasOIDCSecret: c.OIDCClientSecretEnc != nil && *c.OIDCClientSecretEnc != "",
		OIDCScopes:    c.OIDCScopes,
		SAMLEntityID:  c.SAMLEntityID,
		SAMLSSOUrl:    c.SAMLSSOUrl,
		HasSAMLCert:   c.SAMLCertificateEnc != nil && *c.SAMLCertificateEnc != "",
		SAMLMetadataURL: c.SAMLMetadataURL,
		CreatedAt:     c.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:     c.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func toSSOResponses(conns []domain.SSOConnection) []ssoResponse {
	out := make([]ssoResponse, len(conns))
	for i, c := range conns {
		cc := c
		out[i] = toSSOResponse(&cc)
	}
	return out
}

// createSSOBody is the JSON body for create endpoints.
type createSSOBody struct {
	Type              string  `json:"type"`
	DisplayName       string  `json:"display_name"`
	Domain            string  `json:"domain"`
	Enabled           bool    `json:"enabled"`
	OIDCIssuerURL     *string `json:"oidc_issuer_url"`
	OIDCClientID      *string `json:"oidc_client_id"`
	OIDCClientSecret  *string `json:"oidc_client_secret"` // plaintext; encrypted before storage
	OIDCScopes        string  `json:"oidc_scopes"`
	SAMLEntityID      *string `json:"saml_entity_id"`
	SAMLSSOUrl        *string `json:"saml_sso_url"`
	SAMLCertificate   *string `json:"saml_certificate"` // plaintext; encrypted before storage
	SAMLMetadataURL   *string `json:"saml_metadata_url"`
}

// updateSSOBody is the JSON body for update endpoints.
type updateSSOBody struct {
	DisplayName      *string `json:"display_name"`
	Domain           *string `json:"domain"`
	Enabled          *bool   `json:"enabled"`
	OIDCIssuerURL    *string `json:"oidc_issuer_url"`
	OIDCClientID     *string `json:"oidc_client_id"`
	OIDCClientSecret *string `json:"oidc_client_secret"` // plaintext; encrypted before storage
	OIDCScopes       *string `json:"oidc_scopes"`
	SAMLEntityID     *string `json:"saml_entity_id"`
	SAMLSSOUrl       *string `json:"saml_sso_url"`
	SAMLCertificate  *string `json:"saml_certificate"` // plaintext; encrypted before storage
	SAMLMetadataURL  *string `json:"saml_metadata_url"`
}

// encryptOptional encrypts a plaintext pointer if non-nil and non-empty.
// Returns nil if the input is nil (no change intended).
func (h *Handler) encryptOptional(plaintext *string) (*string, error) {
	if plaintext == nil || *plaintext == "" {
		return nil, nil
	}
	enc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, *plaintext)
	if err != nil {
		return nil, err
	}
	return &enc, nil
}

// ---- Admin endpoints (org_id from path) ----

// ListOrgSSO handles GET /admin/organizations/{id}/sso
func (h *Handler) ListOrgSSO(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	repo := repository.NewSSORepo(h.pool)
	conns, err := repo.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, toSSOResponses(conns))
}

// CreateOrgSSO handles POST /admin/organizations/{id}/sso
func (h *Handler) CreateOrgSSO(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var body createSSOBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" || body.DisplayName == "" || body.Domain == "" {
		Error(w, http.StatusBadRequest, "type, display_name, and domain are required")
		return
	}

	secretEnc, err := h.encryptOptional(body.OIDCClientSecret)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	certEnc, err := h.encryptOptional(body.SAMLCertificate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	req := repository.CreateSSORequest{
		Type:                body.Type,
		DisplayName:         body.DisplayName,
		Domain:              body.Domain,
		Enabled:             body.Enabled,
		OIDCIssuerURL:       body.OIDCIssuerURL,
		OIDCClientID:        body.OIDCClientID,
		OIDCClientSecretEnc: secretEnc,
		OIDCScopes:          body.OIDCScopes,
		SAMLEntityID:        body.SAMLEntityID,
		SAMLSSOUrl:          body.SAMLSSOUrl,
		SAMLCertificateEnc:  certEnc,
		SAMLMetadataURL:     body.SAMLMetadataURL,
	}

	repo := repository.NewSSORepo(h.pool)
	conn, err := repo.Create(r.Context(), orgID, req)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, toSSOResponse(conn))
	h.LogAudit(r, "sso.created", "sso_connection", conn.ID, map[string]any{"org_id": orgID})
}

// UpdateOrgSSO handles PATCH /admin/organizations/{id}/sso/{connectionId}
func (h *Handler) UpdateOrgSSO(w http.ResponseWriter, r *http.Request) {
	connectionID := chi.URLParam(r, "connectionId")
	var body updateSSOBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	secretEnc, err := h.encryptOptional(body.OIDCClientSecret)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	certEnc, err := h.encryptOptional(body.SAMLCertificate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	req := repository.UpdateSSORequest{
		DisplayName:         body.DisplayName,
		Domain:              body.Domain,
		Enabled:             body.Enabled,
		OIDCIssuerURL:       body.OIDCIssuerURL,
		OIDCClientID:        body.OIDCClientID,
		OIDCClientSecretEnc: secretEnc,
		OIDCScopes:          body.OIDCScopes,
		SAMLEntityID:        body.SAMLEntityID,
		SAMLSSOUrl:          body.SAMLSSOUrl,
		SAMLCertificateEnc:  certEnc,
		SAMLMetadataURL:     body.SAMLMetadataURL,
	}

	repo := repository.NewSSORepo(h.pool)
	conn, err := repo.Update(r.Context(), connectionID, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, toSSOResponse(conn))
	h.LogAudit(r, "sso.updated", "sso_connection", connectionID, nil)
}

// DeleteOrgSSO handles DELETE /admin/organizations/{id}/sso/{connectionId}
func (h *Handler) DeleteOrgSSO(w http.ResponseWriter, r *http.Request) {
	connectionID := chi.URLParam(r, "connectionId")
	repo := repository.NewSSORepo(h.pool)
	err := repo.Delete(r.Context(), connectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
	h.LogAudit(r, "sso.deleted", "sso_connection", connectionID, nil)
}

// ---- Dashboard endpoints (org_id from session) ----

// ListMySSO handles GET /dashboard/settings/sso
func (h *Handler) ListMySSO(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil || session.OrgID == "" {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	repo := repository.NewSSORepo(h.pool)
	conns, err := repo.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, toSSOResponses(conns))
}

// CreateMySSO handles POST /dashboard/settings/sso
func (h *Handler) CreateMySSO(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil || session.OrgID == "" {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body createSSOBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" || body.DisplayName == "" || body.Domain == "" {
		Error(w, http.StatusBadRequest, "type, display_name, and domain are required")
		return
	}

	secretEnc, err := h.encryptOptional(body.OIDCClientSecret)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	certEnc, err := h.encryptOptional(body.SAMLCertificate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	req := repository.CreateSSORequest{
		Type:                body.Type,
		DisplayName:         body.DisplayName,
		Domain:              body.Domain,
		Enabled:             body.Enabled,
		OIDCIssuerURL:       body.OIDCIssuerURL,
		OIDCClientID:        body.OIDCClientID,
		OIDCClientSecretEnc: secretEnc,
		OIDCScopes:          body.OIDCScopes,
		SAMLEntityID:        body.SAMLEntityID,
		SAMLSSOUrl:          body.SAMLSSOUrl,
		SAMLCertificateEnc:  certEnc,
		SAMLMetadataURL:     body.SAMLMetadataURL,
	}

	repo := repository.NewSSORepo(h.pool)
	conn, err := repo.Create(r.Context(), session.OrgID, req)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, toSSOResponse(conn))
	h.LogAudit(r, "sso.created", "sso_connection", conn.ID, nil)
}

// UpdateMySSO handles PATCH /dashboard/settings/sso/{id}
func (h *Handler) UpdateMySSO(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil || session.OrgID == "" {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	connectionID := chi.URLParam(r, "id")
	var body updateSSOBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Verify the connection belongs to the session org before updating.
	ssoRepo := repository.NewSSORepo(h.pool)
	existing, err := ssoRepo.Get(r.Context(), connectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	secretEnc, err := h.encryptOptional(body.OIDCClientSecret)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	certEnc, err := h.encryptOptional(body.SAMLCertificate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	req := repository.UpdateSSORequest{
		DisplayName:         body.DisplayName,
		Domain:              body.Domain,
		Enabled:             body.Enabled,
		OIDCIssuerURL:       body.OIDCIssuerURL,
		OIDCClientID:        body.OIDCClientID,
		OIDCClientSecretEnc: secretEnc,
		OIDCScopes:          body.OIDCScopes,
		SAMLEntityID:        body.SAMLEntityID,
		SAMLSSOUrl:          body.SAMLSSOUrl,
		SAMLCertificateEnc:  certEnc,
		SAMLMetadataURL:     body.SAMLMetadataURL,
	}

	conn, err := ssoRepo.Update(r.Context(), connectionID, req)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, toSSOResponse(conn))
	h.LogAudit(r, "sso.updated", "sso_connection", connectionID, nil)
}

// DeleteMySSO handles DELETE /dashboard/settings/sso/{id}
func (h *Handler) DeleteMySSO(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil || session.OrgID == "" {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	connectionID := chi.URLParam(r, "id")

	// Verify ownership before deletion.
	ssoRepo := repository.NewSSORepo(h.pool)
	existing, err := ssoRepo.Get(r.Context(), connectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	if err := ssoRepo.Delete(r.Context(), connectionID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
	h.LogAudit(r, "sso.deleted", "sso_connection", connectionID, nil)
}
