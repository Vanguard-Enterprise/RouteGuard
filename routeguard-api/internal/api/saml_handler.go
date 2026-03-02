package api

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	crewsaml "github.com/crewjam/saml"
	"github.com/crewjam/saml/samlsp"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

const samlStateTTL = 10 * time.Minute

// SAMLMetadata handles GET /auth/sso/saml/metadata
//
// Returns the SP metadata XML so IdPs can configure this service provider.
func (h *Handler) SAMLMetadata(w http.ResponseWriter, r *http.Request) {
	sp := h.buildSP(nil)

	md := sp.Metadata()
	out, err := xml.MarshalIndent(md, "", "  ")
	if err != nil {
		log.Error().Err(err).Msg("saml metadata: marshal xml")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(xml.Header))
	_, _ = w.Write(out)
}

// SAMLInit handles GET /auth/sso/{slug}/saml/init
//
// Query params:
//   - connection_id (required) — UUID of the sso_connections row
//   - redirect_after (optional) — relative path to redirect to after login; defaults to /dashboard
//
// Flow: look up SAML connection → build IdP metadata → create SP → store relay state in Redis
// → redirect to IdP SSO URL with SAMLRequest.
func (h *Handler) SAMLInit(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	connectionID := r.URL.Query().Get("connection_id")
	redirectAfter := r.URL.Query().Get("redirect_after")
	if redirectAfter == "" {
		redirectAfter = "/dashboard"
	} else if !isValidRedirectPath(redirectAfter) {
		Error(w, http.StatusBadRequest, "invalid redirect_after value")
		return
	}

	if slug == "" || connectionID == "" {
		Error(w, http.StatusBadRequest, "slug and connection_id are required")
		return
	}

	repo := repository.NewUserRepo(h.pool)
	conn, err := repo.FindSAMLConnectionBySlugAndID(r.Context(), slug, connectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		log.Error().Err(err).Str("connection_id", connectionID).Msg("saml init: db lookup failed")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	idpMeta, err := h.resolveIDPMetadata(r, conn)
	if err != nil {
		log.Error().Err(err).Str("connection_id", connectionID).Msg("saml init: resolve idp metadata")
		Error(w, http.StatusBadGateway, "failed to contact identity provider")
		return
	}

	sp := h.buildSP(idpMeta)

	// Generate relay state token and store it in Redis.
	relayStateToken, err := generateRandomHex(16)
	if err != nil {
		log.Error().Err(err).Msg("saml init: generate relay state token")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	samlState := auth.SAMLRelayState{
		ConnectionID:  connectionID,
		RedirectAfter: redirectAfter,
	}
	if err := h.cache.Set(r.Context(), auth.SAMLStateKey(relayStateToken), samlState, samlStateTTL); err != nil {
		log.Error().Err(err).Msg("saml init: store state in redis")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	redirectURL, err := sp.MakeRedirectAuthenticationRequest(relayStateToken)
	if err != nil {
		log.Error().Err(err).Msg("saml init: make authn request")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	http.Redirect(w, r, redirectURL.String(), http.StatusFound)
}

// SAMLACS handles POST /auth/sso/saml/acs
//
// Flow: parse RelayState → look up state from Redis → look up connection → validate assertion
// → upsert user → sync roles → create session → redirect.
func (h *Handler) SAMLACS(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		Error(w, http.StatusBadRequest, "failed to parse form data")
		return
	}

	relayStateToken := r.FormValue("RelayState")
	if relayStateToken == "" {
		Error(w, http.StatusBadRequest, "missing RelayState")
		return
	}

	// Look up and atomically delete the relay state from Redis (one-time use).
	var samlState auth.SAMLRelayState
	if err := h.cache.GetDel(r.Context(), auth.SAMLStateKey(relayStateToken), &samlState); err != nil {
		if h.cache.IsNotFound(err) {
			Error(w, http.StatusBadRequest, "invalid or expired relay state")
			return
		}
		log.Error().Err(err).Msg("saml acs: redis get state")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewUserRepo(h.pool)
	conn, err := repo.FindSSOConnectionByID(r.Context(), samlState.ConnectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		log.Error().Err(err).Str("connection_id", samlState.ConnectionID).Msg("saml acs: db lookup")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if !conn.Enabled || conn.Type != "saml" {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	idpMeta, err := h.resolveIDPMetadata(r, conn)
	if err != nil {
		log.Error().Err(err).Str("connection_id", conn.ID).Msg("saml acs: resolve idp metadata")
		Error(w, http.StatusBadGateway, "failed to contact identity provider")
		return
	}

	sp := h.buildSP(idpMeta)

	// ParseResponse validates the SAML assertion (signature, audience, conditions).
	// Passing an empty string as the possible request ID allows validation without
	// tracking request IDs server-side; relay state acts as the CSRF protection.
	assertion, err := sp.ParseResponse(r, []string{""})
	if err != nil {
		log.Error().Err(err).Msg("saml acs: parse response")
		Error(w, http.StatusBadRequest, "invalid SAML response")
		return
	}

	// Extract identity from the assertion.
	nameID := samlNameID(assertion)
	if nameID == "" {
		Error(w, http.StatusBadRequest, "SAML assertion missing NameID")
		return
	}

	attrs := samlAttributes(assertion)
	email := samlAttr(attrs, "email", "mail", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress")
	name := samlAttr(attrs, "displayName", "cn", "name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name")

	if email == "" {
		Error(w, http.StatusBadRequest, "identity provider did not return an email attribute")
		return
	}

	// Upsert the user (find-by-nameID → find-by-email → create).
	userID, err := repo.UpsertSAMLUser(r.Context(), nameID, email, name, conn.OrgID)
	if err != nil {
		log.Error().Err(err).Str("name_id", nameID).Msg("saml acs: upsert user")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Build a claims map from SAML attributes for role sync.
	claimsMap := make(map[string]any, len(attrs))
	for k, v := range attrs {
		claimsMap[k] = v
	}

	if err := repo.SyncSSOUserRoles(r.Context(), userID, conn.ID, claimsMap); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("saml acs: sync roles")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	permissions, err := repo.GetUserPermissions(r.Context(), userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("saml acs: get permissions")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	sessionPayload := auth.SessionPayload{
		UserID:  userID,
		OrgID:   conn.OrgID,
		Email:   email,
		Name:    name,
		IsStaff: false,
		Roles:   permissions,
	}
	sessionToken, err := auth.CreateSession(r.Context(), h.cache, sessionPayload)
	if err != nil {
		log.Error().Err(err).Msg("saml acs: create session")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	auth.SetSessionCookie(w, sessionToken, h.cfg.IsProd)
	_ = repo.UpdateLastLogin(r.Context(), userID)

	redirectTo := samlState.RedirectAfter
	if redirectTo == "" || !isValidRedirectPath(redirectTo) {
		redirectTo = "/dashboard"
	}
	http.Redirect(w, r, h.cfg.BaseURL+redirectTo, http.StatusFound)
}

// buildSP constructs a crewjam/saml ServiceProvider using the handler's ephemeral key pair.
// idpMeta may be nil when building the SP for metadata-only purposes.
func (h *Handler) buildSP(idpMeta *crewsaml.EntityDescriptor) crewsaml.ServiceProvider {
	metadataURL, _ := url.Parse(h.cfg.APIBaseURL + "/auth/sso/saml/metadata")
	acsURL, _ := url.Parse(h.cfg.APIBaseURL + "/auth/sso/saml/acs")

	privKey, _ := h.samlKeyPair.PrivateKey.(*rsa.PrivateKey)

	return crewsaml.ServiceProvider{
		EntityID:    metadataURL.String(),
		Key:         privKey,
		Certificate: h.samlKeyPair.Leaf,
		MetadataURL: *metadataURL,
		AcsURL:      *acsURL,
		IDPMetadata: idpMeta,
	}
}

// resolveIDPMetadata returns the IdP EntityDescriptor for the given SSO connection.
// If SAMLMetadataURL is set, it fetches and parses the metadata from that URL.
// Otherwise, it builds a minimal EntityDescriptor from the stored entity ID, SSO URL,
// and encrypted certificate.
func (h *Handler) resolveIDPMetadata(r *http.Request, conn *domain.SSOConnection) (*crewsaml.EntityDescriptor, error) {
	if conn.SAMLMetadataURL != nil && *conn.SAMLMetadataURL != "" {
		u, err := url.Parse(*conn.SAMLMetadataURL)
		if err != nil {
			return nil, err
		}
		return samlsp.FetchMetadata(r.Context(), http.DefaultClient, *u)
	}

	if conn.SAMLEntityID == nil || conn.SAMLSSOUrl == nil || conn.SAMLCertificateEnc == nil {
		return nil, errors.New("saml connection is missing required fields: saml_entity_id, saml_sso_url, or saml_certificate_enc")
	}

	// Decrypt the certificate stored at rest.
	certPEM, err := crypto.Decrypt(h.cfg.DataEncryptionKey, *conn.SAMLCertificateEnc)
	if err != nil {
		return nil, err
	}

	// Normalise: strip PEM headers if present, leaving only the bare base64 DER.
	certData := strings.TrimSpace(certPEM)
	certData = strings.TrimPrefix(certData, "-----BEGIN CERTIFICATE-----")
	certData = strings.TrimSuffix(certData, "-----END CERTIFICATE-----")
	certData = strings.ReplaceAll(certData, "\n", "")
	certData = strings.TrimSpace(certData)

	if _, err := base64.StdEncoding.DecodeString(certData); err != nil {
		return nil, errors.New("saml certificate is not valid base64")
	}

	return &crewsaml.EntityDescriptor{
		EntityID: *conn.SAMLEntityID,
		IDPSSODescriptors: []crewsaml.IDPSSODescriptor{
			{
				SSODescriptor: crewsaml.SSODescriptor{
					RoleDescriptor: crewsaml.RoleDescriptor{
						ProtocolSupportEnumeration: "urn:oasis:names:tc:SAML:2.0:protocol",
						KeyDescriptors: []crewsaml.KeyDescriptor{
							{
								Use: "signing",
								KeyInfo: crewsaml.KeyInfo{
									X509Data: crewsaml.X509Data{
										X509Certificates: []crewsaml.X509Certificate{
											{Data: certData},
										},
									},
								},
							},
						},
					},
				},
				SingleSignOnServices: []crewsaml.Endpoint{
					{
						Binding:  crewsaml.HTTPRedirectBinding,
						Location: *conn.SAMLSSOUrl,
					},
				},
			},
		},
	}, nil
}

// samlNameID extracts the NameID value from a SAML assertion.
func samlNameID(a *crewsaml.Assertion) string {
	if a.Subject != nil && a.Subject.NameID != nil {
		return a.Subject.NameID.Value
	}
	return ""
}

// samlAttributes flattens all AttributeStatement attributes into a name→value map.
// Attributes are indexed by Name; if FriendlyName is also set it is added as an
// additional alias pointing to the same value.  When multiple values exist, only
// the first value is stored.
func samlAttributes(a *crewsaml.Assertion) map[string]string {
	out := make(map[string]string)
	for _, stmt := range a.AttributeStatements {
		for _, attr := range stmt.Attributes {
			if len(attr.Values) == 0 {
				continue
			}
			val := attr.Values[0].Value
			if attr.Name != "" {
				out[attr.Name] = val
			}
			if attr.FriendlyName != "" {
				out[attr.FriendlyName] = val
			}
		}
	}
	return out
}

// samlAttr returns the first non-empty value found under any of the given attribute names.
func samlAttr(attrs map[string]string, names ...string) string {
	for _, n := range names {
		if v := attrs[n]; v != "" {
			return v
		}
	}
	return ""
}
