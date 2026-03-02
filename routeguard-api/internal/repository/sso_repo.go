package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// SSORepo handles SSO connection CRUD.
type SSORepo struct {
	pool *pgxpool.Pool
}

// NewSSORepo creates a new SSORepo.
func NewSSORepo(pool *pgxpool.Pool) *SSORepo {
	return &SSORepo{pool: pool}
}

// CreateSSORequest carries the fields for creating an SSO connection.
// Secrets (OIDCClientSecret, SAMLCertificate) must already be encrypted by the caller.
type CreateSSORequest struct {
	Type                string
	DisplayName         string
	Domain              string
	Enabled             bool
	OIDCIssuerURL       *string
	OIDCClientID        *string
	OIDCClientSecretEnc *string // encrypted value
	OIDCScopes          string
	SAMLEntityID        *string
	SAMLSSOUrl          *string
	SAMLCertificateEnc  *string // encrypted value
	SAMLMetadataURL     *string
}

// UpdateSSORequest carries the fields for updating an SSO connection.
// All fields are optional (pointer = nil means no change).
// Secrets must already be encrypted by the caller.
type UpdateSSORequest struct {
	DisplayName         *string
	Domain              *string
	Enabled             *bool
	OIDCIssuerURL       *string
	OIDCClientID        *string
	OIDCClientSecretEnc *string // encrypted value; nil = no change
	OIDCScopes          *string
	SAMLEntityID        *string
	SAMLSSOUrl          *string
	SAMLCertificateEnc  *string // encrypted value; nil = no change
	SAMLMetadataURL     *string
}

const ssoSelectCols = `
	id, org_id, type, display_name, domain, enabled,
	oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
	saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
	created_at, updated_at
`

func scanSSO(row pgx.Row) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := row.Scan(
		&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Domain, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOUrl, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ListByOrg returns all SSO connections for an organization.
func (r *SSORepo) ListByOrg(ctx context.Context, orgID string) ([]domain.SSOConnection, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+ssoSelectCols+`
		FROM sso_connections
		WHERE org_id = $1
		ORDER BY display_name
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("sso list: %w", err)
	}
	defer rows.Close()

	conns := make([]domain.SSOConnection, 0)
	for rows.Next() {
		var c domain.SSOConnection
		if err := rows.Scan(
			&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Domain, &c.Enabled,
			&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
			&c.SAMLEntityID, &c.SAMLSSOUrl, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		conns = append(conns, c)
	}
	return conns, rows.Err()
}

// Get returns an SSO connection by ID. Returns pgx.ErrNoRows if not found.
func (r *SSORepo) Get(ctx context.Context, id string) (*domain.SSOConnection, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+ssoSelectCols+`
		FROM sso_connections
		WHERE id = $1
	`, id)
	c, err := scanSSO(row)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// Create inserts a new SSO connection and returns the created row.
func (r *SSORepo) Create(ctx context.Context, orgID string, req CreateSSORequest) (*domain.SSOConnection, error) {
	if req.OIDCScopes == "" {
		req.OIDCScopes = "openid email profile"
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO sso_connections (
			id, org_id, type, display_name, domain, enabled,
			oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
			saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4, $5,
			$6, $7, $8, $9,
			$10, $11, $12, $13
		)
		RETURNING `+ssoSelectCols,
		orgID, req.Type, req.DisplayName, req.Domain, req.Enabled,
		req.OIDCIssuerURL, req.OIDCClientID, req.OIDCClientSecretEnc, req.OIDCScopes,
		req.SAMLEntityID, req.SAMLSSOUrl, req.SAMLCertificateEnc, req.SAMLMetadataURL,
	)
	c, err := scanSSO(row)
	if err != nil {
		return nil, fmt.Errorf("sso create: %w", err)
	}
	return c, nil
}

// Update applies a partial update to an SSO connection. Only non-nil fields are updated.
func (r *SSORepo) Update(ctx context.Context, id string, req UpdateSSORequest) (*domain.SSOConnection, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if req.DisplayName != nil {
		args = append(args, *req.DisplayName)
		setClauses = append(setClauses, fmt.Sprintf("display_name = $%d", len(args)))
	}
	if req.Domain != nil {
		args = append(args, *req.Domain)
		setClauses = append(setClauses, fmt.Sprintf("domain = $%d", len(args)))
	}
	if req.Enabled != nil {
		args = append(args, *req.Enabled)
		setClauses = append(setClauses, fmt.Sprintf("enabled = $%d", len(args)))
	}
	if req.OIDCIssuerURL != nil {
		args = append(args, *req.OIDCIssuerURL)
		setClauses = append(setClauses, fmt.Sprintf("oidc_issuer_url = $%d", len(args)))
	}
	if req.OIDCClientID != nil {
		args = append(args, *req.OIDCClientID)
		setClauses = append(setClauses, fmt.Sprintf("oidc_client_id = $%d", len(args)))
	}
	if req.OIDCClientSecretEnc != nil {
		args = append(args, *req.OIDCClientSecretEnc)
		setClauses = append(setClauses, fmt.Sprintf("oidc_client_secret_enc = $%d", len(args)))
	}
	if req.OIDCScopes != nil {
		args = append(args, *req.OIDCScopes)
		setClauses = append(setClauses, fmt.Sprintf("oidc_scopes = $%d", len(args)))
	}
	if req.SAMLEntityID != nil {
		args = append(args, *req.SAMLEntityID)
		setClauses = append(setClauses, fmt.Sprintf("saml_entity_id = $%d", len(args)))
	}
	if req.SAMLSSOUrl != nil {
		args = append(args, *req.SAMLSSOUrl)
		setClauses = append(setClauses, fmt.Sprintf("saml_sso_url = $%d", len(args)))
	}
	if req.SAMLCertificateEnc != nil {
		args = append(args, *req.SAMLCertificateEnc)
		setClauses = append(setClauses, fmt.Sprintf("saml_certificate_enc = $%d", len(args)))
	}
	if req.SAMLMetadataURL != nil {
		args = append(args, *req.SAMLMetadataURL)
		setClauses = append(setClauses, fmt.Sprintf("saml_metadata_url = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE sso_connections
		SET %s, updated_at = NOW()
		WHERE id = %s
		RETURNING `+ssoSelectCols,
		strings.Join(setClauses, ", "), idParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	c, err := scanSSO(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("sso update: %w", err)
	}
	return c, nil
}

// Delete removes an SSO connection by ID. Returns pgx.ErrNoRows if not found.
func (r *SSORepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM sso_connections WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("sso delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
