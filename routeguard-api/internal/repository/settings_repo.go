package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// ErrSystemRole is returned when an operation attempts to modify a system role.
var ErrSystemRole = errors.New("cannot modify system role")

// ============================================================
// UserRepo (settings)
// ============================================================

// SettingsUserRepo handles user management queries scoped to an org.
type SettingsUserRepo struct {
	pool *pgxpool.Pool
}

// NewSettingsUserRepo creates a new SettingsUserRepo.
func NewSettingsUserRepo(pool *pgxpool.Pool) *SettingsUserRepo {
	return &SettingsUserRepo{pool: pool}
}

func scanSettingsUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	if err := row.Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.Phone, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &u, nil
}

// ListByOrg returns a paginated list of users belonging to the given org, ordered by name.
func (r *SettingsUserRepo) ListByOrg(ctx context.Context, orgID string, limit, offset int) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, email, name, phone, avatar_url, last_login_at, created_at
		FROM users
		WHERE org_id = $1
		ORDER BY name
		LIMIT $2 OFFSET $3
	`, orgID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("settings user list: %w", err)
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(
			&u.ID, &u.OrgID, &u.Email, &u.Name, &u.Phone, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("settings user list: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// GetByOrg returns a single user by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *SettingsUserRepo) GetByOrg(ctx context.Context, id, orgID string) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, org_id, email, name, phone, avatar_url, last_login_at, created_at
		FROM users
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	return scanSettingsUser(row)
}

// ListUserRoles returns all org roles assigned to a user, verifying the user belongs to orgID.
func (r *SettingsUserRepo) ListUserRoles(ctx context.Context, userID, orgID string) ([]domain.OrgRole, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT r.id, r.org_id, r.name, r.permissions, r.is_system, r.created_at
		FROM org_roles r
		JOIN user_roles ur ON ur.role_id = r.id
		JOIN users u ON u.id = ur.user_id
		WHERE ur.user_id = $1 AND u.org_id = $2
	`, userID, orgID)
	if err != nil {
		return nil, fmt.Errorf("settings list user roles: %w", err)
	}
	defer rows.Close()

	roles := make([]domain.OrgRole, 0)
	for rows.Next() {
		var role domain.OrgRole
		if err := rows.Scan(
			&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("settings list user roles: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// AssignRole atomically assigns a role to a user, verifying both belong to orgID.
// If already assigned, the existing assignment is returned (idempotent).
// Returns pgx.ErrNoRows if user or role not found in org.
func (r *SettingsUserRepo) AssignRole(ctx context.Context, userID, roleID, orgID string) (*domain.UserRole, error) {
	var ur domain.UserRole
	err := r.pool.QueryRow(ctx, `
		INSERT INTO user_roles (id, user_id, role_id)
		SELECT gen_random_uuid(), u.id, ro.id
		FROM users u, org_roles ro
		WHERE u.id = $1 AND u.org_id = $3
		  AND ro.id = $2 AND ro.org_id = $3
		ON CONFLICT (user_id, role_id) DO UPDATE SET user_id = EXCLUDED.user_id
		RETURNING id, user_id, role_id
	`, userID, roleID, orgID).Scan(&ur.ID, &ur.UserID, &ur.RoleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, err // user or role not found in org
		}
		return nil, fmt.Errorf("settings assign role: %w", err)
	}
	return &ur, nil
}

// UnassignRole removes a role assignment from a user, verifying the user belongs to orgID.
// Returns pgx.ErrNoRows if 0 rows were affected.
func (r *SettingsUserRepo) UnassignRole(ctx context.Context, userID, roleID, orgID string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM user_roles
		WHERE user_id = $1 AND role_id = $2
		  AND EXISTS (SELECT 1 FROM users WHERE id = $1 AND org_id = $3)
	`, userID, roleID, orgID)
	if err != nil {
		return fmt.Errorf("settings unassign role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ListDispatchersByOrg returns name+phone for all users in orgID with the
// dispatcher system role who have a phone number set, ordered by name.
func (r *SettingsUserRepo) ListDispatchersByOrg(ctx context.Context, orgID string) ([]domain.KioskContact, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT u.name, u.phone
		FROM users u
		JOIN user_roles ur ON ur.user_id = u.id
		JOIN org_roles orr ON orr.id = ur.role_id
		WHERE orr.org_id = $1
		  AND orr.name = 'dispatcher'
		  AND orr.is_system = true
		  AND u.phone IS NOT NULL
		  AND u.deleted_at IS NULL
		ORDER BY u.name
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list dispatchers: %w", err)
	}
	defer rows.Close()

	contacts := make([]domain.KioskContact, 0)
	for rows.Next() {
		var c domain.KioskContact
		if err := rows.Scan(&c.Name, &c.Phone); err != nil {
			return nil, fmt.Errorf("list dispatchers scan: %w", err)
		}
		contacts = append(contacts, c)
	}
	return contacts, rows.Err()
}

// UpdatePhone sets the phone number for a user scoped to orgID.
// Pass nil to clear the phone. Returns pgx.ErrNoRows if user not found in org.
func (r *SettingsUserRepo) UpdatePhone(ctx context.Context, orgID, userID string, phone *string) error {
	tag, err := r.pool.Exec(ctx,
		"UPDATE users SET phone = $1 WHERE id = $2 AND org_id = $3",
		phone, userID, orgID,
	)
	if err != nil {
		return fmt.Errorf("update user phone: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ============================================================
// RoleRepo
// ============================================================

// RoleRepo handles org role queries.
type RoleRepo struct {
	pool *pgxpool.Pool
}

// NewRoleRepo creates a new RoleRepo.
func NewRoleRepo(pool *pgxpool.Pool) *RoleRepo {
	return &RoleRepo{pool: pool}
}

func scanRole(row pgx.Row) (*domain.OrgRole, error) {
	var r domain.OrgRole
	if err := row.Scan(&r.ID, &r.OrgID, &r.Name, &r.Permissions, &r.IsSystem, &r.CreatedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

// ListByOrg returns all roles (system + custom) for an org, ordered by is_system DESC, name.
func (r *RoleRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.OrgRole, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, name, permissions, is_system, created_at
		FROM org_roles
		WHERE org_id = $1
		ORDER BY is_system DESC, name
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("role list: %w", err)
	}
	defer rows.Close()

	roles := make([]domain.OrgRole, 0)
	for rows.Next() {
		var role domain.OrgRole
		if err := rows.Scan(
			&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("role list: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// Get returns a single role by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *RoleRepo) Get(ctx context.Context, id, orgID string) (*domain.OrgRole, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, org_id, name, permissions, is_system, created_at
		FROM org_roles
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	return scanRole(row)
}

// Create inserts a new custom role for the org. Returns the created role.
func (r *RoleRepo) Create(ctx context.Context, orgID, name string, permissions []string) (*domain.OrgRole, error) {
	if permissions == nil {
		permissions = []string{}
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO org_roles (org_id, name, permissions)
		VALUES ($1, $2, $3)
		RETURNING id, org_id, name, permissions, is_system, created_at
	`, orgID, name, permissions)
	role, err := scanRole(row)
	if err != nil {
		return nil, fmt.Errorf("role create: %w", err)
	}
	return role, nil
}

// Update applies a partial update to a role. Returns ErrSystemRole if the role is a system role.
// name and permissions are optional — nil means no change.
func (r *RoleRepo) Update(ctx context.Context, id, orgID string, name *string, permissions []string) (*domain.OrgRole, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if name != nil {
		args = append(args, *name)
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", len(args)))
	}
	if permissions != nil {
		args = append(args, permissions)
		setClauses = append(setClauses, fmt.Sprintf("permissions = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		// No fields to update — fetch current state. ErrSystemRole checked inline.
		existing, err := r.Get(ctx, id, orgID)
		if err != nil {
			return nil, err
		}
		if existing.IsSystem {
			return nil, ErrSystemRole
		}
		return existing, nil
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE org_roles
		SET %s
		WHERE id = %s AND org_id = %s AND is_system = false
		RETURNING id, org_id, name, permissions, is_system, created_at
	`, strings.Join(setClauses, ", "), idParam, orgParam)

	row := r.pool.QueryRow(ctx, query, args...)
	role, err := scanRole(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Distinguish not-found vs system-role
			existing, getErr := r.Get(ctx, id, orgID)
			if getErr != nil {
				return nil, getErr
			}
			if existing.IsSystem {
				return nil, ErrSystemRole
			}
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("role update: %w", err)
	}
	return role, nil
}

// Delete removes a role by ID scoped to orgID. Returns ErrSystemRole if system role,
// pgx.ErrNoRows if not found.
func (r *RoleRepo) Delete(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM org_roles WHERE id = $1 AND org_id = $2 AND is_system = false
	`, id, orgID)
	if err != nil {
		return fmt.Errorf("role delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Distinguish not-found vs system-role
		existing, getErr := r.Get(ctx, id, orgID)
		if getErr != nil {
			return getErr
		}
		if existing.IsSystem {
			return ErrSystemRole
		}
		return pgx.ErrNoRows
	}
	return nil
}

// ============================================================
// APIKeyRepo
// ============================================================

// APIKeyRepo handles API key queries.
type APIKeyRepo struct {
	pool *pgxpool.Pool
}

// NewAPIKeyRepo creates a new APIKeyRepo.
func NewAPIKeyRepo(pool *pgxpool.Pool) *APIKeyRepo {
	return &APIKeyRepo{pool: pool}
}

func scanAPIKey(row pgx.Row) (*domain.APIKey, error) {
	var k domain.APIKey
	if err := row.Scan(
		&k.ID, &k.OrgID, &k.Name, &k.KeyHash, &k.KeyPrefix,
		&k.Scopes, &k.LastUsedAt, &k.ExpiresAt, &k.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &k, nil
}

// ListByOrg returns all API keys for the given org, ordered by created_at DESC.
func (r *APIKeyRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.APIKey, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at
		FROM api_keys
		WHERE org_id = $1
		ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("api key list: %w", err)
	}
	defer rows.Close()

	keys := make([]domain.APIKey, 0)
	for rows.Next() {
		var k domain.APIKey
		if err := rows.Scan(
			&k.ID, &k.OrgID, &k.Name, &k.KeyHash, &k.KeyPrefix,
			&k.Scopes, &k.LastUsedAt, &k.ExpiresAt, &k.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("api key list: %w", err)
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// Create inserts a new API key and returns it.
func (r *APIKeyRepo) Create(ctx context.Context, orgID, name, keyHash, keyPrefix string, scopes []string, expiresAt *time.Time) (*domain.APIKey, error) {
	if scopes == nil {
		scopes = []string{}
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO api_keys (org_id, name, key_hash, key_prefix, scopes, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, org_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at
	`, orgID, name, keyHash, keyPrefix, scopes, expiresAt)
	k, err := scanAPIKey(row)
	if err != nil {
		return nil, fmt.Errorf("api key create: %w", err)
	}
	return k, nil
}

// Delete removes an API key by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *APIKeyRepo) Delete(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM api_keys WHERE id = $1 AND org_id = $2
	`, id, orgID)
	if err != nil {
		return fmt.Errorf("api key delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
