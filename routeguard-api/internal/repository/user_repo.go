package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// UserRepo handles user and identity queries.
type UserRepo struct {
	pool *pgxpool.Pool
}

// NewUserRepo creates a new UserRepo.
func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

// FindByEmailAndProvider looks up a user by email and returns their password_hash.
// Returns the user and the password_hash from user_identities.
func (r *UserRepo) FindByEmailAndProvider(ctx context.Context, email, provider string) (*domain.User, string, error) {
	var u domain.User
	var passwordHash string

	row := r.pool.QueryRow(ctx, `
		SELECT u.id, u.org_id, u.email, u.name, u.avatar_url, u.last_login_at, u.created_at,
		       ui.password_hash
		FROM users u
		JOIN user_identities ui ON ui.user_id = u.id
		WHERE u.email = $1 AND ui.provider = $2
	`, email, provider)

	err := row.Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt,
		&passwordHash,
	)
	if err != nil {
		return nil, "", err
	}
	return &u, passwordHash, nil
}

// FindByID looks up a user by their ID.
func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, created_at
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserPermissions returns the flat list of permission strings for a user
// by joining user_roles → org_roles → permissions[].
func (r *UserRepo) GetUserPermissions(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT unnest(orr.permissions)
		FROM user_roles ur
		JOIN org_roles orr ON orr.id = ur.role_id
		WHERE ur.user_id = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("get user permissions: %w", err)
	}
	defer rows.Close()

	permissions := make([]string, 0)
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		permissions = append(permissions, p)
	}
	return permissions, rows.Err()
}

// UpdateLastLogin sets last_login_at to now for the given user.
func (r *UserRepo) UpdateLastLogin(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE users SET last_login_at = NOW() WHERE id = $1", userID)
	return err
}

// UpdateProfile updates the name and avatar_url of a user and returns the updated record.
// Returns pgx.ErrNoRows if the user does not exist.
func (r *UserRepo) UpdateProfile(ctx context.Context, userID, name string, avatarURL *string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		UPDATE users SET name = $1, avatar_url = $2
		WHERE id = $3
		RETURNING id, org_id, email, name, avatar_url, last_login_at, created_at
	`, name, avatarURL, userID).Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetPasswordHash returns the bcrypt password_hash for the given user's password identity.
// Returns pgx.ErrNoRows if the user has no password identity (SSO-only account).
func (r *UserRepo) GetPasswordHash(ctx context.Context, userID string) (string, error) {
	var hash string
	err := r.pool.QueryRow(ctx,
		"SELECT password_hash FROM user_identities WHERE user_id = $1 AND provider = 'password'",
		userID,
	).Scan(&hash)
	return hash, err
}

// SetPasswordHash updates the bcrypt password_hash for the given user's password identity.
func (r *UserRepo) SetPasswordHash(ctx context.Context, userID, hash string) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE user_identities SET password_hash = $1 WHERE user_id = $2 AND provider = 'password'",
		hash, userID,
	)
	return err
}

// FindSSOConnectionBySlugAndID looks up an enabled OIDC SSO connection by org slug and connection ID.
// Returns pgx.ErrNoRows if not found, not enabled, or not of type "oidc".
func (r *UserRepo) FindSSOConnectionBySlugAndID(ctx context.Context, slug, connectionID string) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx, `
		SELECT sc.id, sc.org_id, sc.type, sc.display_name, sc.domain, sc.enabled,
		       sc.oidc_issuer_url, sc.oidc_client_id, sc.oidc_client_secret_enc, sc.oidc_scopes,
		       sc.saml_entity_id, sc.saml_sso_url, sc.saml_certificate_enc, sc.saml_metadata_url,
		       sc.created_at, sc.updated_at
		FROM sso_connections sc
		JOIN organizations o ON o.id = sc.org_id
		WHERE o.slug = $1
		  AND sc.id = $2
		  AND sc.type = 'oidc'
		  AND sc.enabled = true
	`, slug, connectionID).Scan(
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

// FindSAMLConnectionBySlugAndID looks up an enabled SAML SSO connection by org slug and connection ID.
// Returns pgx.ErrNoRows if not found, not enabled, or not of type "saml".
func (r *UserRepo) FindSAMLConnectionBySlugAndID(ctx context.Context, slug, connectionID string) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx, `
		SELECT sc.id, sc.org_id, sc.type, sc.display_name, sc.domain, sc.enabled,
		       sc.oidc_issuer_url, sc.oidc_client_id, sc.oidc_client_secret_enc, sc.oidc_scopes,
		       sc.saml_entity_id, sc.saml_sso_url, sc.saml_certificate_enc, sc.saml_metadata_url,
		       sc.created_at, sc.updated_at
		FROM sso_connections sc
		JOIN organizations o ON o.id = sc.org_id
		WHERE o.slug = $1
		  AND sc.id = $2
		  AND sc.type = 'saml'
		  AND sc.enabled = true
	`, slug, connectionID).Scan(
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

// FindSSOConnectionByID looks up any SSO connection by its primary key.
// Returns pgx.ErrNoRows if not found.
func (r *UserRepo) FindSSOConnectionByID(ctx context.Context, connectionID string) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, type, display_name, domain, enabled,
		       oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		       saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		       created_at, updated_at
		FROM sso_connections
		WHERE id = $1
	`, connectionID).Scan(
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

// UpsertOIDCUser finds an existing user by OIDC (provider=oidc, provider_user_id=sub) or by
// email within the same org, creating a new user + identity row if neither exists.
// Returns the user ID. All writes are performed inside a single transaction.
func (r *UserRepo) UpsertOIDCUser(ctx context.Context, sub, email, name, orgID string) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("upsert oidc user: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// 1. Try to find by provider identity (sub).
	var userID string
	err = tx.QueryRow(ctx, `
		SELECT user_id FROM user_identities
		WHERE provider = 'oidc' AND provider_user_id = $1
	`, sub).Scan(&userID)
	if err == nil {
		return userID, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("upsert oidc user: lookup by sub: %w", err)
	}

	// 2. Try to find by email within the org — link this IdP identity to the existing user.
	err = tx.QueryRow(ctx, `
		SELECT id FROM users WHERE email = $1 AND org_id = $2
	`, email, orgID).Scan(&userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("upsert oidc user: lookup by email: %w", err)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		// 3. Create brand-new user row.
		err = tx.QueryRow(ctx, `
			INSERT INTO users (org_id, email, name)
			VALUES ($1, $2, $3)
			RETURNING id
		`, orgID, email, name).Scan(&userID)
		if err != nil {
			return "", fmt.Errorf("upsert oidc user: create user: %w", err)
		}
	}

	// 4. Insert user_identity linking this sub to the user.
	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, provider_user_id)
		VALUES ($1, 'oidc', $2)
		ON CONFLICT (user_id, provider) DO UPDATE
		    SET provider_user_id = EXCLUDED.provider_user_id
	`, userID, sub)
	if err != nil {
		return "", fmt.Errorf("upsert oidc user: insert identity: %w", err)
	}
	return userID, tx.Commit(ctx)
}

// UpsertSAMLUser finds an existing user by SAML (provider=saml, provider_user_id=nameID) or by
// email within the same org, creating a new user + identity row if neither exists.
// Returns the user ID. All writes are performed inside a single transaction.
func (r *UserRepo) UpsertSAMLUser(ctx context.Context, nameID, email, name, orgID string) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("upsert saml user: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// 1. Try to find by provider identity (nameID).
	var userID string
	err = tx.QueryRow(ctx, `
		SELECT user_id FROM user_identities
		WHERE provider = 'saml' AND provider_user_id = $1
	`, nameID).Scan(&userID)
	if err == nil {
		return userID, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("upsert saml user: lookup by name_id: %w", err)
	}

	// 2. Try to find by email within the org — link this IdP identity to the existing user.
	err = tx.QueryRow(ctx, `
		SELECT id FROM users WHERE email = $1 AND org_id = $2
	`, email, orgID).Scan(&userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("upsert saml user: lookup by email: %w", err)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		// 3. Create brand-new user row.
		err = tx.QueryRow(ctx, `
			INSERT INTO users (org_id, email, name)
			VALUES ($1, $2, $3)
			RETURNING id
		`, orgID, email, name).Scan(&userID)
		if err != nil {
			return "", fmt.Errorf("upsert saml user: create user: %w", err)
		}
	}

	// 4. Insert user_identity linking this nameID to the user.
	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, provider_user_id)
		VALUES ($1, 'saml', $2)
		ON CONFLICT (user_id, provider) DO UPDATE
		    SET provider_user_id = EXCLUDED.provider_user_id
	`, userID, nameID)
	if err != nil {
		return "", fmt.Errorf("upsert saml user: insert identity: %w", err)
	}
	return userID, tx.Commit(ctx)
}

// SyncSSOUserRoles deletes all existing role assignments for the user that belong to the
// connection's org, then re-inserts any roles whose sso_role_mapping claim matches the
// provided claims map (string equality on claim_value). All operations are performed
// inside a single transaction so the delete and all inserts are atomic.
func (r *UserRepo) SyncSSOUserRoles(ctx context.Context, userID, connectionID string, claims map[string]any) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("sync sso roles: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Fetch the org_id for this connection so we only touch roles in the right org.
	var orgID string
	err = tx.QueryRow(ctx,
		"SELECT org_id FROM sso_connections WHERE id = $1", connectionID,
	).Scan(&orgID)
	if err != nil {
		return fmt.Errorf("sync sso roles: fetch org: %w", err)
	}

	// Delete all role assignments for this user that belong to the org.
	_, err = tx.Exec(ctx, `
		DELETE FROM user_roles
		WHERE user_id = $1
		  AND role_id IN (SELECT id FROM org_roles WHERE org_id = $2)
	`, userID, orgID)
	if err != nil {
		return fmt.Errorf("sync sso roles: delete existing: %w", err)
	}

	// Fetch all role mappings for this connection.
	rows, err := tx.Query(ctx, `
		SELECT claim_key, claim_value, org_role_id
		FROM sso_role_mappings
		WHERE sso_connection_id = $1
	`, connectionID)
	if err != nil {
		return fmt.Errorf("sync sso roles: fetch mappings: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var claimKey, claimValue, roleID string
		if err := rows.Scan(&claimKey, &claimValue, &roleID); err != nil {
			return fmt.Errorf("sync sso roles: scan mapping: %w", err)
		}
		// Check if the claim matches (string comparison).
		if val, ok := claims[claimKey]; ok {
			if fmt.Sprintf("%v", val) == claimValue {
				_, err = tx.Exec(ctx, `
					INSERT INTO user_roles (user_id, role_id)
					VALUES ($1, $2)
					ON CONFLICT DO NOTHING
				`, userID, roleID)
				if err != nil {
					return fmt.Errorf("sync sso roles: insert role %s: %w", roleID, err)
				}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
