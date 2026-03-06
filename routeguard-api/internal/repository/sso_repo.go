package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type SSORepo struct {
	pool *pgxpool.Pool
}

func NewSSORepo(pool *pgxpool.Pool) *SSORepo {
	return &SSORepo{pool: pool}
}

func (r *SSORepo) Create(ctx context.Context, conn *domain.SSOConnection) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx,
		`INSERT INTO sso_connections (org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at`,
		conn.OrgID, conn.Type, conn.DisplayName, conn.Enabled,
		conn.OIDCIssuerURL, conn.OIDCClientID, conn.OIDCClientSecretEnc, conn.OIDCScopes,
		conn.SAMLEntityID, conn.SAMLSSOURL, conn.SAMLCertificateEnc, conn.SAMLMetadataURL,
	).Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create sso connection: %w", err)
	}
	return &c, nil
}

func (r *SSORepo) GetByID(ctx context.Context, id string) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at
		 FROM sso_connections WHERE id = $1`, id,
	).Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get sso connection: %w", err)
	}
	return &c, nil
}

func (r *SSORepo) ListByOrg(ctx context.Context, orgID string) ([]domain.SSOConnection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at
		 FROM sso_connections WHERE org_id = $1 ORDER BY created_at`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list sso connections: %w", err)
	}
	defer rows.Close()

	var conns []domain.SSOConnection
	for rows.Next() {
		var c domain.SSOConnection
		if err := rows.Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
			&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
			&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
			&c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan sso connection: %w", err)
		}
		conns = append(conns, c)
	}
	return conns, nil
}

// ListEnabledByUserOrgs returns enabled SSO connections for orgs a user belongs to.
func (r *SSORepo) ListEnabledByUserOrgs(ctx context.Context, userID string) ([]domain.SSOConnection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.org_id, s.type, s.display_name, s.enabled,
		 s.oidc_issuer_url, s.oidc_client_id, s.oidc_client_secret_enc, s.oidc_scopes,
		 s.saml_entity_id, s.saml_sso_url, s.saml_certificate_enc, s.saml_metadata_url,
		 s.created_at, s.updated_at
		 FROM sso_connections s
		 JOIN org_memberships m ON m.org_id = s.org_id
		 WHERE m.user_id = $1 AND s.enabled = true
		 ORDER BY s.created_at`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list enabled sso by user orgs: %w", err)
	}
	defer rows.Close()

	var conns []domain.SSOConnection
	for rows.Next() {
		var c domain.SSOConnection
		if err := rows.Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
			&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
			&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
			&c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan sso connection: %w", err)
		}
		conns = append(conns, c)
	}
	return conns, nil
}

func (r *SSORepo) Update(ctx context.Context, conn *domain.SSOConnection) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx,
		`UPDATE sso_connections SET display_name = $2, enabled = $3,
		 oidc_issuer_url = $4, oidc_client_id = $5, oidc_client_secret_enc = $6, oidc_scopes = $7,
		 saml_entity_id = $8, saml_sso_url = $9, saml_certificate_enc = $10, saml_metadata_url = $11,
		 updated_at = now()
		 WHERE id = $1
		 RETURNING id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at`,
		conn.ID, conn.DisplayName, conn.Enabled,
		conn.OIDCIssuerURL, conn.OIDCClientID, conn.OIDCClientSecretEnc, conn.OIDCScopes,
		conn.SAMLEntityID, conn.SAMLSSOURL, conn.SAMLCertificateEnc, conn.SAMLMetadataURL,
	).Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update sso connection: %w", err)
	}
	return &c, nil
}

func (r *SSORepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sso_connections WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete sso connection: %w", err)
	}
	return nil
}
