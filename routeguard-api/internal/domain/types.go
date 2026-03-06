package domain

import "time"

type User struct {
	ID           string    `json:"id"`
	EmailEnc     string    `json:"-"`
	EmailHash    string    `json:"-"`
	Email        string    `json:"email"`
	NameEnc      string    `json:"-"`
	Name         string    `json:"name"`
	PasswordHash *string   `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Organization struct {
	ID         string    `json:"id"`
	NameEnc    string    `json:"-"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	IsPlatform bool      `json:"is_platform"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type OrgMembership struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	OrgID     string    `json:"org_id"`
	CreatedAt time.Time `json:"created_at"`
}

type OrgRole struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	Name        string    `json:"name"`
	Permissions []string  `json:"permissions"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
}

type OrgMemberRole struct {
	ID           string    `json:"id"`
	MembershipID string    `json:"membership_id"`
	RoleID       string    `json:"role_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type SSOConnection struct {
	ID                  string    `json:"id"`
	OrgID               string    `json:"org_id"`
	Type                string    `json:"type"`
	DisplayName         string    `json:"display_name"`
	Enabled             bool      `json:"enabled"`
	OIDCIssuerURL       *string   `json:"oidc_issuer_url,omitempty"`
	OIDCClientID        *string   `json:"oidc_client_id,omitempty"`
	OIDCClientSecretEnc *string   `json:"-"`
	OIDCScopes          *string   `json:"oidc_scopes,omitempty"`
	SAMLEntityID        *string   `json:"saml_entity_id,omitempty"`
	SAMLSSOURL          *string   `json:"saml_sso_url,omitempty"`
	SAMLCertificateEnc  *string   `json:"-"`
	SAMLMetadataURL     *string   `json:"saml_metadata_url,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type UserIdentity struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Provider       string    `json:"provider"`
	ProviderUserID *string   `json:"provider_user_id,omitempty"`
	Metadata       []byte    `json:"metadata,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// SessionPayload is stored in Redis as the session value.
type SessionPayload struct {
	UserID      string   `json:"user_id"`
	OrgID       string   `json:"org_id"`
	Permissions []string `json:"permissions"`
	CreatedAt   int64    `json:"created_at"`
}

// AuthMethodsResponse is returned by the /auth/lookup endpoint.
type AuthMethodsResponse struct {
	HasPassword bool              `json:"has_password"`
	SSOOptions  []SSOOptionPublic `json:"sso_options"`
}

// SSOOptionPublic is the public-facing SSO connection info for the login page.
type SSOOptionPublic struct {
	ConnectionID string `json:"connection_id"`
	Type         string `json:"type"`
	DisplayName  string `json:"display_name"`
	OrgSlug      string `json:"org_slug"`
	OrgName      string `json:"org_name"`
}

// OrgSummary is a lightweight org representation for the org selector.
type OrgSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPlatform bool   `json:"is_platform"`
}

// MeResponse is returned by /auth/me.
type MeResponse struct {
	User        User       `json:"user"`
	ActiveOrg   OrgSummary `json:"active_org"`
	Permissions []string   `json:"permissions"`
}
