package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
	"golang.org/x/oauth2"
)

const oauthStateTTL = 10 * time.Minute

// OIDCInit handles GET /auth/sso/{slug}/init
//
// Query params:
//   - connection_id (required) — UUID of the sso_connections row
//   - redirect_after (optional) — URL to redirect to after login; defaults to /dashboard
//
// Flow: look up connection → decrypt secret → discover provider → build auth URL with PKCE
// → store state in Redis → 302 redirect.
func (h *Handler) OIDCInit(w http.ResponseWriter, r *http.Request) {
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
	conn, err := repo.FindSSOConnectionBySlugAndID(r.Context(), slug, connectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		log.Error().Err(err).Str("connection_id", connectionID).Msg("oidc init: db lookup failed")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if conn.OIDCIssuerURL == nil || conn.OIDCClientID == nil || conn.OIDCClientSecretEnc == nil {
		Error(w, http.StatusBadRequest, "OIDC connection is not fully configured")
		return
	}

	// Decrypt the client secret stored at rest.
	clientSecret, err := crypto.Decrypt(h.cfg.DataEncryptionKey, *conn.OIDCClientSecretEnc)
	if err != nil {
		log.Error().Err(err).Str("connection_id", connectionID).Msg("oidc init: decrypt client secret")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Discover provider endpoints via OIDC well-known configuration.
	provider, err := gooidc.NewProvider(r.Context(), *conn.OIDCIssuerURL)
	if err != nil {
		log.Error().Err(err).Str("issuer", *conn.OIDCIssuerURL).Msg("oidc init: provider discovery failed")
		Error(w, http.StatusBadGateway, "failed to contact identity provider")
		return
	}

	scopes := buildScopes(conn.OIDCScopes)
	cfg := &oauth2.Config{
		ClientID:     *conn.OIDCClientID,
		ClientSecret: clientSecret,
		RedirectURL:  h.cfg.APIBaseURL + "/auth/sso/callback",
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	// Generate PKCE verifier + state token.
	verifier := oauth2.GenerateVerifier()
	stateToken, err := generateRandomHex(16)
	if err != nil {
		log.Error().Err(err).Msg("oidc init: generate state token")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	oauthState := auth.OAuthState{
		State:         stateToken,
		CodeVerifier:  verifier,
		ConnectionID:  connectionID,
		RedirectAfter: redirectAfter,
	}

	if err := h.cache.Set(r.Context(), auth.OAuthStateKey(stateToken), oauthState, oauthStateTTL); err != nil {
		log.Error().Err(err).Msg("oidc init: store state in redis")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	authURL := cfg.AuthCodeURL(
		stateToken,
		oauth2.S256ChallengeOption(verifier),
	)

	http.Redirect(w, r, authURL, http.StatusFound)
}

// OIDCCallback handles GET /auth/sso/callback
//
// Query params:
//   - code  — authorization code from IdP
//   - state — opaque state token matching the value stored in Redis
//
// Flow: validate state → look up connection → exchange code → verify ID token →
// upsert user → sync roles → create session → redirect.
func (h *Handler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	stateToken := r.URL.Query().Get("state")

	if code == "" || stateToken == "" {
		Error(w, http.StatusBadRequest, "missing code or state parameter")
		return
	}

	// Look up and atomically delete the state from Redis (one-time use, prevents replay).
	var oauthState auth.OAuthState
	stateKey := auth.OAuthStateKey(stateToken)
	if err := h.cache.GetDel(r.Context(), stateKey, &oauthState); err != nil {
		if h.cache.IsNotFound(err) {
			Error(w, http.StatusBadRequest, "invalid or expired state")
			return
		}
		log.Error().Err(err).Msg("oidc callback: redis get state")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewUserRepo(h.pool)
	conn, err := repo.FindSSOConnectionByID(r.Context(), oauthState.ConnectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		log.Error().Err(err).Str("connection_id", oauthState.ConnectionID).Msg("oidc callback: db lookup")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if !conn.Enabled || conn.Type != "oidc" {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	if conn.OIDCIssuerURL == nil || conn.OIDCClientID == nil || conn.OIDCClientSecretEnc == nil {
		Error(w, http.StatusBadRequest, "OIDC connection is not fully configured")
		return
	}

	clientSecret, err := crypto.Decrypt(h.cfg.DataEncryptionKey, *conn.OIDCClientSecretEnc)
	if err != nil {
		log.Error().Err(err).Str("connection_id", conn.ID).Msg("oidc callback: decrypt client secret")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Re-discover provider (stateless; no caching).
	provider, err := gooidc.NewProvider(r.Context(), *conn.OIDCIssuerURL)
	if err != nil {
		log.Error().Err(err).Str("issuer", *conn.OIDCIssuerURL).Msg("oidc callback: provider discovery")
		Error(w, http.StatusBadGateway, "failed to contact identity provider")
		return
	}

	scopes := buildScopes(conn.OIDCScopes)
	oauthCfg := &oauth2.Config{
		ClientID:     *conn.OIDCClientID,
		ClientSecret: clientSecret,
		RedirectURL:  h.cfg.APIBaseURL + "/auth/sso/callback",
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	// Exchange the authorization code for tokens using the PKCE verifier.
	token, err := oauthCfg.Exchange(r.Context(), code, oauth2.VerifierOption(oauthState.CodeVerifier))
	if err != nil {
		log.Error().Err(err).Msg("oidc callback: token exchange")
		Error(w, http.StatusBadGateway, "failed to contact identity provider")
		return
	}

	// Extract and verify the raw ID token from the OAuth2 token response.
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		log.Error().Msg("oidc callback: no id_token in response")
		Error(w, http.StatusBadGateway, "identity provider did not return an ID token")
		return
	}

	verifier := provider.Verifier(&gooidc.Config{ClientID: *conn.OIDCClientID})
	idToken, err := verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		log.Error().Err(err).Msg("oidc callback: id token verification failed")
		Error(w, http.StatusUnauthorized, "invalid ID token")
		return
	}

	// Extract claims from the ID token.
	var claims map[string]any
	if err := idToken.Claims(&claims); err != nil {
		log.Error().Err(err).Msg("oidc callback: extract claims")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	sub := idToken.Subject
	email := stringClaim(claims, "email")
	name := resolveName(claims)

	if email == "" {
		Error(w, http.StatusBadRequest, "identity provider did not return an email claim")
		return
	}

	// Upsert the user (find-by-sub → find-by-email → create).
	userID, err := repo.UpsertOIDCUser(r.Context(), sub, email, name, conn.OrgID)
	if err != nil {
		log.Error().Err(err).Str("sub", sub).Msg("oidc callback: upsert user")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Sync role assignments based on claim mappings.
	if err := repo.SyncSSOUserRoles(r.Context(), userID, conn.ID, claims); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("oidc callback: sync roles")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Fetch the up-to-date permission list for the session.
	permissions, err := repo.GetUserPermissions(r.Context(), userID)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("oidc callback: get permissions")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Build and persist the session.
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
		log.Error().Err(err).Msg("oidc callback: create session")
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	auth.SetSessionCookie(w, sessionToken, h.cfg.IsProd)
	_ = repo.UpdateLastLogin(r.Context(), userID)

	redirectTo := oauthState.RedirectAfter
	if redirectTo == "" || !isValidRedirectPath(redirectTo) {
		redirectTo = "/dashboard"
	}
	http.Redirect(w, r, h.cfg.BaseURL+redirectTo, http.StatusFound)
}

// buildScopes returns the scope list, ensuring "openid" is always present.
// conn.OIDCScopes is space-separated (e.g. "openid email profile").
func buildScopes(oidcScopes string) []string {
	fields := strings.Fields(oidcScopes)
	seen := make(map[string]bool, len(fields)+1)
	scopes := []string{}
	// Always include "openid" first.
	scopes = append(scopes, gooidc.ScopeOpenID)
	seen[gooidc.ScopeOpenID] = true
	for _, s := range fields {
		if !seen[s] {
			scopes = append(scopes, s)
			seen[s] = true
		}
	}
	return scopes
}

// stringClaim safely extracts a string value from a claims map.
func stringClaim(claims map[string]any, key string) string {
	v, _ := claims[key].(string)
	return v
}

// resolveName builds a display name from OIDC claims, preferring "name" then
// falling back to "given_name" + " " + "family_name".
func resolveName(claims map[string]any) string {
	if n := stringClaim(claims, "name"); n != "" {
		return n
	}
	given := stringClaim(claims, "given_name")
	family := stringClaim(claims, "family_name")
	full := strings.TrimSpace(given + " " + family)
	if full != "" {
		return full
	}
	return ""
}

// generateRandomHex returns a hex-encoded string of n random bytes.
func generateRandomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// isValidRedirectPath returns true if s is a safe relative redirect path:
// it must start with "/" but must NOT start with "//" (protocol-relative URL)
// or "/\" (backslash bypass variant).
func isValidRedirectPath(s string) bool {
	return strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "//") && !strings.HasPrefix(s, `/\`)
}
