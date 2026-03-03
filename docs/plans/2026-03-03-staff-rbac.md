# Staff User & RBAC System - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add staff user management and role-based access control to the `/admin` panel so RouteGuard staff can be created, assigned custom roles, and soft-deleted with a 30-day recovery window.

**Architecture:** Two new tables (`staff_roles`, `staff_user_roles`) sit alongside the existing org RBAC tables without touching them. Staff permissions are loaded at login and stored in the Redis session `Roles` slice, identical to how org permissions work. Soft delete sets `users.deleted_at`; a daily goroutine hard-deletes rows older than 30 days.

**Tech Stack:** Go 1.24, chi router, pgx/v5, go-redis/v9, Next.js 16 App Router, TypeScript, shadcn/ui, React Hook Form, Zod, SWR.

**Design doc:** `docs/plans/2026-03-03-staff-rbac-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `routeguard-api/migrations/005_staff_rbac.up.sql`
- Create: `routeguard-api/migrations/005_staff_rbac.down.sql`

**Step 1: Create up migration**

```sql
-- routeguard-api/migrations/005_staff_rbac.up.sql

-- Soft delete support (staff only, but on shared users table)
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- Staff roles: parallel to org_roles but not org-scoped
CREATE TABLE staff_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOL NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protected super_admin role seeded here
INSERT INTO staff_roles (name, permissions, is_system) VALUES (
  'super_admin',
  ARRAY['orgs:read','orgs:write','devices:read','devices:write','audit:read','staff:manage'],
  true
);

-- Staff user <-> role join table
CREATE TABLE staff_user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES staff_roles(id) ON DELETE CASCADE,
  UNIQUE (user_id, role_id)
);

CREATE INDEX idx_staff_user_roles_user_id ON staff_user_roles(user_id);
```

**Step 2: Create down migration**

```sql
-- routeguard-api/migrations/005_staff_rbac.down.sql
DROP TABLE IF EXISTS staff_user_roles;
DROP TABLE IF EXISTS staff_roles;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
```

**Step 3: Verify the migration applies cleanly**

```bash
cd routeguard-api
go build ./cmd/api
```

Expected: builds with no errors (migration runs at startup).

**Step 4: Commit**

```bash
git add routeguard-api/migrations/005_staff_rbac.up.sql routeguard-api/migrations/005_staff_rbac.down.sql
git commit -m "feat: add staff_roles and staff_user_roles migration"
```

---

### Task 2: Domain Types

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`

**Step 1: Add `DeletedAt` to `User` and add new staff types**

In `types.go`, update the `User` struct and add two new types after the `SSORoleMapping` block:

```go
// User maps to the users table.
type User struct {
	ID          string     `json:"id"`
	OrgID       *string    `json:"org_id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	AvatarURL   *string    `json:"avatar_url"`
	LastLoginAt *time.Time `json:"last_login_at"`
	DeletedAt   *time.Time `json:"deleted_at"`
	CreatedAt   time.Time  `json:"created_at"`
}
```

After the existing `SSORoleMapping` struct (around line 112), add:

```go
// StaffRole maps to the staff_roles table.
type StaffRole struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Permissions []string  `json:"permissions"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
}

// StaffUserRole maps to the staff_user_roles table.
type StaffUserRole struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	RoleID string `json:"role_id"`
}
```

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors. (Some scan calls in repos will now fail because `deleted_at` is a new column - that is expected and will be fixed in Task 5.)

**Step 3: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git commit -m "feat: add StaffRole, StaffUserRole types and deleted_at to User"
```

---

### Task 3: Cache - Set Operations

**Files:**
- Modify: `routeguard-api/internal/cache/cache.go`

**Step 1: Add `SAdd`, `SMembers`, and `SRem` methods**

Append to `cache.go` after the `Expire` method:

```go
// SAdd adds a member to a Redis set and sets/refreshes the TTL.
// Used for tracking active session tokens per user.
func (c *Cache) SAdd(ctx context.Context, key, member string, ttl time.Duration) error {
	pipe := c.client.Pipeline()
	pipe.SAdd(ctx, key, member)
	pipe.Expire(ctx, key, ttl)
	_, err := pipe.Exec(ctx)
	return err
}

// SMembers returns all members of a Redis set.
func (c *Cache) SMembers(ctx context.Context, key string) ([]string, error) {
	return c.client.SMembers(ctx, key).Result()
}

// SRem removes a member from a Redis set.
func (c *Cache) SRem(ctx context.Context, key, member string) error {
	return c.client.SRem(ctx, key, member).Err()
}
```

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./...
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/cache/cache.go
git commit -m "feat: add SAdd, SMembers, SRem to cache"
```

---

### Task 4: Auth Session - Per-User Tracking

**Files:**
- Modify: `routeguard-api/internal/auth/session.go`

**Step 1: Add session tracking helpers**

Add a `userSessionsKey` helper and update `CreateSession`, `DestroySession`, and add `InvalidateUserSessions`:

```go
const (
	SessionCookieName  = "rg_session"
	SessionTTL         = 7 * 24 * time.Hour
	sessionKeyPrefix   = "session:"
	userSessionsPrefix = "user_sessions:"
)

func userSessionsKey(userID string) string {
	return userSessionsPrefix + userID
}
```

Replace the existing `CreateSession` function:

```go
// CreateSession generates a random token, stores the session payload in Redis,
// and tracks the token in a per-user set for bulk invalidation.
func CreateSession(ctx context.Context, c *cache.Cache, payload SessionPayload) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", err
	}
	payload.CreatedAt = time.Now().Unix()
	if err := c.Set(ctx, sessionKeyPrefix+token, payload, SessionTTL); err != nil {
		return "", err
	}
	// Non-fatal: track this token under the user so we can bulk-invalidate on soft delete.
	_ = c.SAdd(ctx, userSessionsKey(payload.UserID), token, SessionTTL)
	return token, nil
}
```

Replace `DestroySession`:

```go
// DestroySession deletes a session from Redis and removes it from the user's session set.
func DestroySession(ctx context.Context, c *cache.Cache, token, userID string) error {
	_ = c.SRem(ctx, userSessionsKey(userID), token)
	return c.Del(ctx, sessionKeyPrefix+token)
}
```

Add `InvalidateUserSessions` after `DestroySession`:

```go
// InvalidateUserSessions deletes all active sessions for a user.
// Called on soft delete to immediately revoke access.
func InvalidateUserSessions(ctx context.Context, c *cache.Cache, userID string) error {
	tokens, err := c.SMembers(ctx, userSessionsKey(userID))
	if err != nil {
		return err
	}
	keys := make([]string, 0, len(tokens)+1)
	for _, t := range tokens {
		keys = append(keys, sessionKeyPrefix+t)
	}
	keys = append(keys, userSessionsKey(userID))
	return c.Del(ctx, keys...)
}
```

**Step 2: Fix the `Logout` handler** (in `routeguard-api/internal/api/auth_handler.go`)

`DestroySession` now requires `userID`. Update the `Logout` handler to get the session first:

```go
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := auth.TokenFromRequest(r)
	if token != "" {
		if payload, err := auth.GetSession(r.Context(), h.cache, token); err == nil {
			_ = auth.DestroySession(r.Context(), h.cache, token, payload.UserID)
		} else {
			// Session already expired - just clear cookie
			_ = h.cache.Del(r.Context(), "session:"+token)
		}
	}
	auth.ClearSessionCookie(w)
	NoContent(w)
}
```

**Step 3: Build to verify**

```bash
cd routeguard-api && go build ./...
```

**Step 4: Commit**

```bash
git add routeguard-api/internal/auth/session.go routeguard-api/internal/api/auth_handler.go
git commit -m "feat: per-user session tracking and bulk invalidation"
```

---

### Task 5: Staff Role Repository

**Files:**
- Create: `routeguard-api/internal/repository/staff_role_repo.go`

**Step 1: Create the file**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// StaffRoleRepo handles queries for staff_roles and staff_user_roles.
type StaffRoleRepo struct {
	pool *pgxpool.Pool
}

// NewStaffRoleRepo creates a new StaffRoleRepo.
func NewStaffRoleRepo(pool *pgxpool.Pool) *StaffRoleRepo {
	return &StaffRoleRepo{pool: pool}
}

// GetStaffUserPermissions returns the flat list of permission strings for a staff user
// by joining staff_user_roles -> staff_roles -> permissions[].
func (r *StaffRoleRepo) GetStaffUserPermissions(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT unnest(sr.permissions)
		FROM staff_user_roles sur
		JOIN staff_roles sr ON sr.id = sur.role_id
		WHERE sur.user_id = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("get staff permissions: %w", err)
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

// ListStaffRoles returns all staff roles.
func (r *StaffRoleRepo) ListStaffRoles(ctx context.Context) ([]domain.StaffRole, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, permissions, is_system, created_at
		FROM staff_roles ORDER BY name
	`)
	if err != nil {
		return nil, fmt.Errorf("list staff roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.StaffRole
	for rows.Next() {
		var role domain.StaffRole
		if err := rows.Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// GetStaffRole returns a single staff role by ID.
func (r *StaffRoleRepo) GetStaffRole(ctx context.Context, id string) (*domain.StaffRole, error) {
	var role domain.StaffRole
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, permissions, is_system, created_at
		FROM staff_roles WHERE id = $1
	`, id).Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// CreateStaffRole inserts a new non-system staff role.
func (r *StaffRoleRepo) CreateStaffRole(ctx context.Context, name string, permissions []string) (*domain.StaffRole, error) {
	var role domain.StaffRole
	err := r.pool.QueryRow(ctx, `
		INSERT INTO staff_roles (name, permissions, is_system)
		VALUES ($1, $2, false)
		RETURNING id, name, permissions, is_system, created_at
	`, name, permissions).Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create staff role: %w", err)
	}
	return &role, nil
}

// UpdateStaffRole updates the name and permissions of a non-system staff role.
// Returns an error if the role is a system role.
func (r *StaffRoleRepo) UpdateStaffRole(ctx context.Context, id, name string, permissions []string) (*domain.StaffRole, error) {
	var role domain.StaffRole
	err := r.pool.QueryRow(ctx, `
		UPDATE staff_roles
		SET name = $1, permissions = $2
		WHERE id = $3 AND is_system = false
		RETURNING id, name, permissions, is_system, created_at
	`, name, permissions, id).Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update staff role: %w", err)
	}
	return &role, nil
}

// DeleteStaffRole deletes a non-system staff role.
// Returns pgx.ErrNoRows if the role is a system role or does not exist.
func (r *StaffRoleRepo) DeleteStaffRole(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		"DELETE FROM staff_roles WHERE id = $1 AND is_system = false", id)
	if err != nil {
		return fmt.Errorf("delete staff role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("role not found or is a system role")
	}
	return nil
}

// ListUserStaffRoles returns all staff roles assigned to a user.
func (r *StaffRoleRepo) ListUserStaffRoles(ctx context.Context, userID string) ([]domain.StaffRole, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT sr.id, sr.name, sr.permissions, sr.is_system, sr.created_at
		FROM staff_user_roles sur
		JOIN staff_roles sr ON sr.id = sur.role_id
		WHERE sur.user_id = $1
		ORDER BY sr.name
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list user staff roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.StaffRole
	for rows.Next() {
		var role domain.StaffRole
		if err := rows.Scan(&role.ID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

// AssignStaffRole assigns a role to a staff user. No-op if already assigned.
func (r *StaffRoleRepo) AssignStaffRole(ctx context.Context, userID, roleID string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO staff_user_roles (user_id, role_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, roleID)
	return err
}

// UnassignStaffRole removes a role from a staff user.
func (r *StaffRoleRepo) UnassignStaffRole(ctx context.Context, userID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		"DELETE FROM staff_user_roles WHERE user_id = $1 AND role_id = $2", userID, roleID)
	return err
}
```

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./...
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/staff_role_repo.go
git commit -m "feat: staff role repository"
```

---

### Task 6: Staff User Repository

**Files:**
- Create: `routeguard-api/internal/repository/staff_user_repo.go`
- Modify: `routeguard-api/internal/repository/user_repo.go` (fix `deleted_at` scan)

**Step 1: Fix `user_repo.go` scans for the new `deleted_at` column**

The existing `FindByID` and `FindByEmailAndProvider` queries need to scan `deleted_at`. Update `FindByID`:

```go
func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
```

Update `UpdateProfile`:

```go
func (r *UserRepo) UpdateProfile(ctx context.Context, userID, name string, avatarURL *string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx, `
		UPDATE users SET name = $1, avatar_url = $2
		WHERE id = $3
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, name, avatarURL, userID).Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
```

**Step 2: Create `staff_user_repo.go`**

```go
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

// StaffUserRepo handles staff user CRUD including soft/hard delete.
type StaffUserRepo struct {
	pool *pgxpool.Pool
}

// NewStaffUserRepo creates a new StaffUserRepo.
func NewStaffUserRepo(pool *pgxpool.Pool) *StaffUserRepo {
	return &StaffUserRepo{pool: pool}
}

// scanStaffUser scans a staff user row (id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at).
func scanStaffUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ListStaffUsers returns all staff users (org_id IS NULL), including soft-deleted ones.
func (r *StaffUserRepo) ListStaffUsers(ctx context.Context) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users
		WHERE org_id IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list staff users: %w", err)
	}
	defer rows.Close()

	var users []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// GetStaffUser returns a single staff user by ID. Returns pgx.ErrNoRows if not found or not staff.
func (r *StaffUserRepo) GetStaffUser(ctx context.Context, id string) (*domain.User, error) {
	return scanStaffUser(r.pool.QueryRow(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users WHERE id = $1 AND org_id IS NULL
	`, id))
}

// CreateStaffUser creates a new staff user with a password identity.
// Returns the created user.
func (r *StaffUserRepo) CreateStaffUser(ctx context.Context, email, name, password string) (*domain.User, error) {
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("create staff user: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var u domain.User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, name)
		VALUES ($1, $2)
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, email, name).Scan(&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create staff user: insert user: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, password_hash)
		VALUES ($1, 'password', $2)
	`, u.ID, hash)
	if err != nil {
		return nil, fmt.Errorf("create staff user: insert identity: %w", err)
	}

	return &u, tx.Commit(ctx)
}

// UpdateStaffUser updates the name of a staff user.
func (r *StaffUserRepo) UpdateStaffUser(ctx context.Context, id, name string) (*domain.User, error) {
	return scanStaffUser(r.pool.QueryRow(ctx, `
		UPDATE users SET name = $1
		WHERE id = $2 AND org_id IS NULL AND deleted_at IS NULL
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, name, id))
}

// SoftDeleteStaffUser sets deleted_at to now for a staff user.
func (r *StaffUserRepo) SoftDeleteStaffUser(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		"UPDATE users SET deleted_at = NOW() WHERE id = $1 AND org_id IS NULL AND deleted_at IS NULL",
		id)
	if err != nil {
		return fmt.Errorf("soft delete staff user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// RestoreStaffUser clears deleted_at for a staff user within the 30-day window.
func (r *StaffUserRepo) RestoreStaffUser(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		"UPDATE users SET deleted_at = NULL WHERE id = $1 AND org_id IS NULL AND deleted_at IS NOT NULL",
		id)
	if err != nil {
		return fmt.Errorf("restore staff user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// HardDeleteExpiredStaffUsers permanently deletes staff users soft-deleted more than 30 days ago.
// Returns the number of rows deleted.
func (r *StaffUserRepo) HardDeleteExpiredStaffUsers(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM users
		WHERE org_id IS NULL
		  AND deleted_at IS NOT NULL
		  AND deleted_at < NOW() - INTERVAL '30 days'
	`)
	if err != nil {
		return 0, fmt.Errorf("hard delete expired staff users: %w", err)
	}
	return tag.RowsAffected(), nil
}

// GetExpiredStaffUserIDs returns IDs of staff users eligible for hard delete.
// Used to clean up their Redis session sets before hard deleting.
func (r *StaffUserRepo) GetExpiredStaffUserIDs(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM users
		WHERE org_id IS NULL
		  AND deleted_at IS NOT NULL
		  AND deleted_at < NOW() - INTERVAL '30 days'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// DaysUntilDeletion returns how many days remain before the user is hard-deleted.
// Returns 0 if not soft-deleted.
func DaysUntilDeletion(deletedAt *time.Time) int {
	if deletedAt == nil {
		return 0
	}
	remaining := time.Until(deletedAt.Add(30 * 24 * time.Hour))
	if remaining <= 0 {
		return 0
	}
	return int(remaining.Hours()/24) + 1
}
```

**Step 3: Build to verify**

```bash
cd routeguard-api && go build ./...
```

**Step 4: Commit**

```bash
git add routeguard-api/internal/repository/staff_user_repo.go routeguard-api/internal/repository/user_repo.go
git commit -m "feat: staff user repository with soft delete"
```

---

### Task 7: Auth Handler - Staff Permission Loading

**Files:**
- Modify: `routeguard-api/internal/api/auth_handler.go`

**Step 1: Update `Login` to use `GetStaffUserPermissions` for staff and block deleted users**

In `Login`, replace the current `permissions` loading block and add the deleted check. The updated section (after password verification at line 56) should read:

```go
	// Block login for soft-deleted users.
	if user.DeletedAt != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	isStaff := user.OrgID == nil

	var permissions []string
	if isStaff {
		staffRoleRepo := repository.NewStaffRoleRepo(h.pool)
		permissions, err = staffRoleRepo.GetStaffUserPermissions(r.Context(), user.ID)
	} else {
		permissions, err = userRepo.GetUserPermissions(r.Context(), user.ID)
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
```

The `FindByEmailAndProvider` query also needs to scan `deleted_at`. Update the `Login` handler's call to `FindByEmailAndProvider` - but that method only returns `*domain.User` and `User` now has `DeletedAt`, so it will be populated as long as the query selects it. Update the query in `user_repo.go`'s `FindByEmailAndProvider`:

```go
func (r *UserRepo) FindByEmailAndProvider(ctx context.Context, email, provider string) (*domain.User, string, error) {
	var u domain.User
	var passwordHash string

	row := r.pool.QueryRow(ctx, `
		SELECT u.id, u.org_id, u.email, u.name, u.avatar_url, u.last_login_at, u.deleted_at, u.created_at,
		       ui.password_hash
		FROM users u
		JOIN user_identities ui ON ui.user_id = u.id
		WHERE u.email = $1 AND ui.provider = $2
	`, email, provider)

	err := row.Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt,
		&passwordHash,
	)
	if err != nil {
		return nil, "", err
	}
	return &u, passwordHash, nil
}
```

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./...
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/api/auth_handler.go routeguard-api/internal/repository/user_repo.go
git commit -m "feat: load staff permissions at login, block deleted users"
```

---

### Task 8: RBAC Middleware - RequireStaffPermission

**Files:**
- Modify: `routeguard-api/internal/middleware/rbac.go`
- Modify: `routeguard-api/internal/middleware/auth_test.go`

**Step 1: Write the failing tests** (add to `auth_test.go`)

```go
func TestRequireStaffPermission_HasPermission(t *testing.T) {
	session := &auth.SessionPayload{
		UserID:  "staff1",
		IsStaff: true,
		Roles:   []string{"orgs:read", "staff:manage"},
	}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)
	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	middleware.RequireStaffPermission("staff:manage")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRequireStaffPermission_MissingPermission(t *testing.T) {
	session := &auth.SessionPayload{
		UserID:  "staff1",
		IsStaff: true,
		Roles:   []string{"orgs:read"},
	}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)
	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	middleware.RequireStaffPermission("staff:manage")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestRequireStaffPermission_NoSession(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	middleware.RequireStaffPermission("staff:manage")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
```

**Step 2: Run tests to verify they fail**

```bash
cd routeguard-api && go test -v -run TestRequireStaffPermission ./internal/middleware/
```

Expected: FAIL - `RequireStaffPermission undefined`

**Step 3: Add `RequireStaffPermission` to `rbac.go`**

```go
// RequireStaffPermission checks that the session staff user has the given permission string.
// Identical logic to RequirePermission; named separately for clarity in admin route wiring.
// Must be used after Authenticate and RequireStaff middleware.
func RequireStaffPermission(permission string) func(http.Handler) http.Handler {
	return RequirePermission(permission)
}
```

**Step 4: Run tests to verify they pass**

```bash
cd routeguard-api && go test -v -run TestRequireStaffPermission ./internal/middleware/
```

Expected: PASS (3 tests)

**Step 5: Run all tests**

```bash
cd routeguard-api && go test -v ./...
```

Expected: all PASS

**Step 6: Commit**

```bash
git add routeguard-api/internal/middleware/rbac.go routeguard-api/internal/middleware/auth_test.go
git commit -m "feat: add RequireStaffPermission middleware with tests"
```

---

### Task 9: Staff Handler

**Files:**
- Create: `routeguard-api/internal/api/staff_handler.go`

**Step 1: Create the handler file**

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/middleware"
	"github.com/routeguard/api/internal/repository"
)

// ============================================================
// Staff Users
// ============================================================

type staffUserResponse struct {
	ID              string              `json:"id"`
	Email           string              `json:"email"`
	Name            string              `json:"name"`
	AvatarURL       *string             `json:"avatar_url"`
	LastLoginAt     *string             `json:"last_login_at"`
	DeletedAt       *string             `json:"deleted_at"`
	DaysUntilDelete int                 `json:"days_until_deletion"`
	Roles           []staffRoleResponse `json:"roles"`
	CreatedAt       string              `json:"created_at"`
}

type staffRoleResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
	IsSystem    bool     `json:"is_system"`
}

// ListStaffUsers handles GET /admin/staff/users
func (h *Handler) ListStaffUsers(w http.ResponseWriter, r *http.Request) {
	userRepo := repository.NewStaffUserRepo(h.pool)
	roleRepo := repository.NewStaffRoleRepo(h.pool)

	users, err := userRepo.ListStaffUsers(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp := make([]staffUserResponse, 0, len(users))
	for _, u := range users {
		roles, err := roleRepo.ListUserStaffRoles(r.Context(), u.ID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		roleResps := make([]staffRoleResponse, 0, len(roles))
		for _, role := range roles {
			roleResps = append(roleResps, staffRoleResponse{
				ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
			})
		}
		sur := staffUserResponse{
			ID:              u.ID,
			Email:           u.Email,
			Name:            u.Name,
			AvatarURL:       u.AvatarURL,
			Roles:           roleResps,
			DaysUntilDelete: repository.DaysUntilDeletion(u.DeletedAt),
			CreatedAt:       u.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
		if u.LastLoginAt != nil {
			s := u.LastLoginAt.Format("2006-01-02T15:04:05Z")
			sur.LastLoginAt = &s
		}
		if u.DeletedAt != nil {
			s := u.DeletedAt.Format("2006-01-02T15:04:05Z")
			sur.DeletedAt = &s
		}
		resp = append(resp, sur)
	}
	JSON(w, http.StatusOK, resp)
}

// CreateStaffUser handles POST /admin/staff/users
func (h *Handler) CreateStaffUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Name == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email, name, and password are required")
		return
	}
	if len(req.Password) < 8 {
		Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	userRepo := repository.NewStaffUserRepo(h.pool)
	user, err := userRepo.CreateStaffUser(r.Context(), req.Email, req.Name, req.Password)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, staffUserResponse{
		ID: user.ID, Email: user.Email, Name: user.Name, Roles: []staffRoleResponse{},
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// GetStaffUser handles GET /admin/staff/users/{id}
func (h *Handler) GetStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userRepo := repository.NewStaffUserRepo(h.pool)
	roleRepo := repository.NewStaffRoleRepo(h.pool)

	user, err := userRepo.GetStaffUser(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	roles, err := roleRepo.ListUserStaffRoles(r.Context(), id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	roleResps := make([]staffRoleResponse, 0, len(roles))
	for _, role := range roles {
		roleResps = append(roleResps, staffRoleResponse{
			ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
		})
	}
	sur := staffUserResponse{
		ID: user.ID, Email: user.Email, Name: user.Name, AvatarURL: user.AvatarURL,
		Roles: roleResps, DaysUntilDelete: repository.DaysUntilDeletion(user.DeletedAt),
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if user.LastLoginAt != nil {
		s := user.LastLoginAt.Format("2006-01-02T15:04:05Z")
		sur.LastLoginAt = &s
	}
	if user.DeletedAt != nil {
		s := user.DeletedAt.Format("2006-01-02T15:04:05Z")
		sur.DeletedAt = &s
	}
	JSON(w, http.StatusOK, sur)
}

// UpdateStaffUser handles PATCH /admin/staff/users/{id}
func (h *Handler) UpdateStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	userRepo := repository.NewStaffUserRepo(h.pool)
	user, err := userRepo.UpdateStaffUser(r.Context(), id, req.Name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	JSON(w, http.StatusOK, staffUserResponse{
		ID: user.ID, Email: user.Email, Name: user.Name,
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	})
}

// DeleteStaffUser handles DELETE /admin/staff/users/{id} (soft delete)
func (h *Handler) DeleteStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Prevent self-deletion
	session := middleware.SessionFromContext(r.Context())
	if session != nil && session.UserID == id {
		Error(w, http.StatusBadRequest, "cannot delete your own account")
		return
	}

	userRepo := repository.NewStaffUserRepo(h.pool)
	if err := userRepo.SoftDeleteStaffUser(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	// Invalidate all sessions for this user immediately.
	_ = auth.InvalidateUserSessions(r.Context(), h.cache, id)
	NoContent(w)
}

// RestoreStaffUser handles POST /admin/staff/users/{id}/restore
func (h *Handler) RestoreStaffUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userRepo := repository.NewStaffUserRepo(h.pool)
	if err := userRepo.RestoreStaffUser(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found or not deleted")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	NoContent(w)
}

// ListStaffUserRoles handles GET /admin/staff/users/{id}/roles
func (h *Handler) ListStaffUserRoles(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	roles, err := roleRepo.ListUserStaffRoles(r.Context(), id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	resp := make([]staffRoleResponse, 0, len(roles))
	for _, role := range roles {
		resp = append(resp, staffRoleResponse{
			ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
		})
	}
	JSON(w, http.StatusOK, resp)
}

// AssignStaffUserRole handles POST /admin/staff/users/{id}/roles
func (h *Handler) AssignStaffUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	var req struct {
		RoleID string `json:"role_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RoleID == "" {
		Error(w, http.StatusBadRequest, "role_id is required")
		return
	}
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	if err := roleRepo.AssignStaffRole(r.Context(), userID, req.RoleID); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// UnassignStaffUserRole handles DELETE /admin/staff/users/{id}/roles/{roleId}
func (h *Handler) UnassignStaffUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	roleID := chi.URLParam(r, "roleId")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	if err := roleRepo.UnassignStaffRole(r.Context(), userID, roleID); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ============================================================
// Staff Roles
// ============================================================

// ListStaffRoles handles GET /admin/staff/roles
func (h *Handler) ListStaffRoles(w http.ResponseWriter, r *http.Request) {
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	roles, err := roleRepo.ListStaffRoles(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	resp := make([]staffRoleResponse, 0, len(roles))
	for _, role := range roles {
		resp = append(resp, staffRoleResponse{
			ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
		})
	}
	JSON(w, http.StatusOK, resp)
}

// CreateStaffRole handles POST /admin/staff/roles
func (h *Handler) CreateStaffRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	role, err := roleRepo.CreateStaffRole(r.Context(), req.Name, req.Permissions)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusCreated, staffRoleResponse{
		ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
	})
}

// GetStaffRole handles GET /admin/staff/roles/{id}
func (h *Handler) GetStaffRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	role, err := roleRepo.GetStaffRole(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	JSON(w, http.StatusOK, staffRoleResponse{
		ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
	})
}

// UpdateStaffRole handles PATCH /admin/staff/roles/{id}
func (h *Handler) UpdateStaffRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	role, err := roleRepo.UpdateStaffRole(r.Context(), id, req.Name, req.Permissions)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "role not found or is a system role")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	JSON(w, http.StatusOK, staffRoleResponse{
		ID: role.ID, Name: role.Name, Permissions: role.Permissions, IsSystem: role.IsSystem,
	})
}

// DeleteStaffRole handles DELETE /admin/staff/roles/{id}
func (h *Handler) DeleteStaffRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleRepo := repository.NewStaffRoleRepo(h.pool)
	if err := roleRepo.DeleteStaffRole(r.Context(), id); err != nil {
		if err.Error() == "role not found or is a system role" {
			Error(w, http.StatusNotFound, "role not found or is a system role")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	NoContent(w)
}
```

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./...
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/api/staff_handler.go
git commit -m "feat: staff user and role API handlers"
```

---

### Task 10: Wire Server Routes

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Add staff routes inside the `/admin` block**

After the existing `r.Get("/audit-logs", h.ListAuditLogs)` line in `buildRouter`, add:

```go
		// Staff users
		r.With(middleware.RequireStaffPermission("staff:manage")).Get("/staff/users", h.ListStaffUsers)
		r.With(middleware.RequireStaffPermission("staff:manage")).Post("/staff/users", h.CreateStaffUser)
		r.With(middleware.RequireStaffPermission("staff:manage")).Get("/staff/users/{id}", h.GetStaffUser)
		r.With(middleware.RequireStaffPermission("staff:manage")).Patch("/staff/users/{id}", h.UpdateStaffUser)
		r.With(middleware.RequireStaffPermission("staff:manage")).Delete("/staff/users/{id}", h.DeleteStaffUser)
		r.With(middleware.RequireStaffPermission("staff:manage")).Post("/staff/users/{id}/restore", h.RestoreStaffUser)
		r.With(middleware.RequireStaffPermission("staff:manage")).Get("/staff/users/{id}/roles", h.ListStaffUserRoles)
		r.With(middleware.RequireStaffPermission("staff:manage")).Post("/staff/users/{id}/roles", h.AssignStaffUserRole)
		r.With(middleware.RequireStaffPermission("staff:manage")).Delete("/staff/users/{id}/roles/{roleId}", h.UnassignStaffUserRole)

		// Staff roles
		r.With(middleware.RequireStaffPermission("staff:manage")).Get("/staff/roles", h.ListStaffRoles)
		r.With(middleware.RequireStaffPermission("staff:manage")).Post("/staff/roles", h.CreateStaffRole)
		r.With(middleware.RequireStaffPermission("staff:manage")).Get("/staff/roles/{id}", h.GetStaffRole)
		r.With(middleware.RequireStaffPermission("staff:manage")).Patch("/staff/roles/{id}", h.UpdateStaffRole)
		r.With(middleware.RequireStaffPermission("staff:manage")).Delete("/staff/roles/{id}", h.DeleteStaffRole)
```

**Step 2: Build and run tests**

```bash
cd routeguard-api && go build ./... && go test -v ./...
```

Expected: all PASS

**Step 3: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire staff user and role routes"
```

---

### Task 11: Background Hard-Delete Goroutine

**Files:**
- Modify: `routeguard-api/cmd/api/main.go`

**Step 1: Add the cleanup goroutine**

After the `log.Info().Msg("Redis connected")` line, add:

```go
	// Start background goroutine to hard-delete staff users 30+ days after soft delete.
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		staffUserRepo := repository.NewStaffUserRepo(pool)
		for {
			select {
			case <-ticker.C:
				// Get IDs first to clean Redis sets before row deletion.
				ids, err := staffUserRepo.GetExpiredStaffUserIDs(ctx)
				if err != nil {
					log.Error().Err(err).Msg("cleanup: get expired staff user IDs failed")
					continue
				}
				for _, id := range ids {
					_ = auth.InvalidateUserSessions(ctx, c, id)
				}
				n, err := staffUserRepo.HardDeleteExpiredStaffUsers(ctx)
				if err != nil {
					log.Error().Err(err).Msg("cleanup: hard delete expired staff users failed")
					continue
				}
				if n > 0 {
					log.Info().Int64("count", n).Msg("cleanup: hard deleted expired staff users")
				}
			}
		}
	}()
```

Add the required import `"github.com/routeguard/api/internal/repository"` to the import block.

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./cmd/api
```

**Step 3: Commit**

```bash
git add routeguard-api/cmd/api/main.go
git commit -m "feat: daily background hard-delete for expired staff users"
```

---

### Task 12: Dashboard API Client

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add TypeScript types**

After the existing `OrgRole` interface, add:

```typescript
export interface StaffRole {
  id: string
  name: string
  permissions: string[]
  is_system: boolean
  created_at: string
}

export interface StaffUser {
  id: string
  email: string
  name: string
  avatar_url: string | null
  last_login_at: string | null
  deleted_at: string | null
  days_until_deletion: number
  roles: StaffRole[]
  created_at: string
}
```

**Step 2: Add API methods inside the `admin` object**

After the existing `profile` section in `api.admin`, add:

```typescript
    staff: {
      users: {
        list: () => request<StaffUser[]>('/admin/staff/users'),
        get: (id: string) => request<StaffUser>(`/admin/staff/users/${id}`),
        create: (data: { email: string; name: string; password: string }) =>
          request<StaffUser>('/admin/staff/users', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: { name: string }) =>
          request<StaffUser>(`/admin/staff/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
        delete: (id: string) => request<void>(`/admin/staff/users/${id}`, { method: 'DELETE' }),
        restore: (id: string) => request<void>(`/admin/staff/users/${id}/restore`, { method: 'POST' }),
        roles: {
          list: (userId: string) => request<StaffRole[]>(`/admin/staff/users/${userId}/roles`),
          assign: (userId: string, roleId: string) =>
            request<void>(`/admin/staff/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ role_id: roleId }) }),
          unassign: (userId: string, roleId: string) =>
            request<void>(`/admin/staff/users/${userId}/roles/${roleId}`, { method: 'DELETE' }),
        },
      },
      roles: {
        list: () => request<StaffRole[]>('/admin/staff/roles'),
        get: (id: string) => request<StaffRole>(`/admin/staff/roles/${id}`),
        create: (data: { name: string; permissions: string[] }) =>
          request<StaffRole>('/admin/staff/roles', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: { name: string; permissions: string[] }) =>
          request<StaffRole>(`/admin/staff/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
        delete: (id: string) => request<void>(`/admin/staff/roles/${id}`, { method: 'DELETE' }),
      },
    },
```

**Step 3: Lint and type-check**

```bash
cd dashboard && npm run lint
```

Expected: 0 errors

**Step 4: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: staff user and role API client types and methods"
```

---

### Task 13: Frontend - Staff Users List Page

**Files:**
- Create: `dashboard/app/admin/staff/users/page.tsx`

**Step 1: Create the page**

```tsx
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RestoreUserButton } from '@/components/admin/restore-user-button'

export const dynamic = 'force-dynamic'

export default async function StaffUsersPage() {
  const users = await api.admin.staff.users.list()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RouteGuard internal staff accounts
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/staff/users/new">Add Staff User</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className={user.deleted_at ? 'opacity-60' : ''}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role.id} variant="secondary">
                      {role.name}
                    </Badge>
                  ))}
                  {user.roles.length === 0 && (
                    <span className="text-muted-foreground text-xs">No roles</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {user.last_login_at
                  ? new Date(user.last_login_at).toLocaleDateString()
                  : 'Never'}
              </TableCell>
              <TableCell>
                {user.deleted_at ? (
                  <Badge variant="destructive">
                    Deleted - removes in {user.days_until_deletion}d
                  </Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {user.deleted_at ? (
                  <RestoreUserButton userId={user.id} />
                ) : (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/staff/users/${user.id}`}>Edit</Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No staff users yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

**Step 2: Create `RestoreUserButton` client component**

Create `dashboard/components/admin/restore-user-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function RestoreUserButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleRestore() {
    setLoading(true)
    try {
      await api.admin.staff.users.restore(userId)
      toast.success('User restored')
      router.refresh()
    } catch {
      toast.error('Failed to restore user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRestore} disabled={loading}>
      Restore
    </Button>
  )
}
```

**Step 3: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 errors

**Step 4: Commit**

```bash
git add dashboard/app/admin/staff/users/page.tsx dashboard/components/admin/restore-user-button.tsx
git commit -m "feat: staff users list page"
```

---

### Task 14: Frontend - Create Staff User Page

**Files:**
- Create: `dashboard/app/admin/staff/users/new/page.tsx`

**Step 1: Create the page**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, APIError } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type FormData = z.infer<typeof schema>

export default function NewStaffUserPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const user = await api.admin.staff.users.create(data)
      toast.success('Staff user created')
      router.push(`/admin/staff/users/${user.id}`)
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Add Staff User</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new RouteGuard staff account. Assign roles after creation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} placeholder="Jane Smith" />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} placeholder="jane@route-guard.com" />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Temporary Password</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create User'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

**Step 3: Commit**

```bash
git add dashboard/app/admin/staff/users/new/page.tsx
git commit -m "feat: create staff user page"
```

---

### Task 15: Frontend - Staff User Detail Page

**Files:**
- Create: `dashboard/app/admin/staff/users/[id]/page.tsx`

**Step 1: Create the page**

```tsx
import { notFound } from 'next/navigation'
import { api, APIError } from '@/lib/api'
import { StaffUserDetailClient } from '@/components/admin/staff-user-detail-client'

export const dynamic = 'force-dynamic'

export default async function StaffUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, allRoles] = await Promise.all([
    api.admin.staff.users.get(id).catch((err) => {
      if (err instanceof APIError && err.status === 404) return null
      throw err
    }),
    api.admin.staff.roles.list(),
  ])
  if (!user) notFound()
  return <StaffUserDetailClient user={user} allRoles={allRoles} />
}
```

**Step 2: Create `StaffUserDetailClient` component**

Create `dashboard/components/admin/staff-user-detail-client.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, type StaffUser, type StaffRole } from '@/lib/api'

interface Props {
  user: StaffUser
  allRoles: StaffRole[]
}

export function StaffUserDetailClient({ user, allRoles }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const assignedRoleIds = new Set(user.roles.map((r) => r.id))
  const unassignedRoles = allRoles.filter((r) => !assignedRoleIds.has(r.id))

  async function handleAssign(roleId: string) {
    setLoading(roleId)
    try {
      await api.admin.staff.users.roles.assign(user.id, roleId)
      toast.success('Role assigned')
      router.refresh()
    } catch {
      toast.error('Failed to assign role')
    } finally {
      setLoading(null)
    }
  }

  async function handleUnassign(roleId: string) {
    setLoading(roleId)
    try {
      await api.admin.staff.users.roles.unassign(user.id, roleId)
      toast.success('Role removed')
      router.refresh()
    } catch {
      toast.error('Failed to remove role')
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${user.name}? They will be permanently removed in 30 days.`)) return
    try {
      await api.admin.staff.users.delete(user.id)
      toast.success('User deleted')
      router.push('/admin/staff/users')
    } catch {
      toast.error('Failed to delete user')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        {!user.deleted_at && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            Delete User
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {user.roles.length === 0 && (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          )}
          {user.roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{role.name}</Badge>
                {role.is_system && <span className="text-xs text-muted-foreground">system</span>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading === role.id}
                onClick={() => handleUnassign(role.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {unassignedRoles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassignedRoles.map((role) => (
              <div key={role.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{role.name}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {role.permissions.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading === role.id}
                  onClick={() => handleAssign(role.id)}
                >
                  Assign
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

**Step 3: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

**Step 4: Commit**

```bash
git add dashboard/app/admin/staff/users/[id]/page.tsx dashboard/components/admin/staff-user-detail-client.tsx
git commit -m "feat: staff user detail page with role assignment"
```

---

### Task 16: Frontend - Staff Roles Pages

**Files:**
- Create: `dashboard/app/admin/staff/roles/page.tsx`
- Create: `dashboard/app/admin/staff/roles/new/page.tsx`
- Create: `dashboard/app/admin/staff/roles/[id]/page.tsx`

**Step 1: Create roles list page**

```tsx
// dashboard/app/admin/staff/roles/page.tsx
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function StaffRolesPage() {
  const roles = await api.admin.staff.roles.list()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define permission sets for RouteGuard staff
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/staff/roles/new">New Role</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {role.name}
                  {role.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {!role.is_system && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/staff/roles/${role.id}`}>Edit</Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

**Step 2: Create role form component**

Create `dashboard/components/admin/staff-role-form.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, APIError, type StaffRole } from '@/lib/api'

const ALL_PERMISSIONS = [
  { value: 'orgs:read', label: 'Organizations - Read', description: 'View organizations and SSO connections' },
  { value: 'orgs:write', label: 'Organizations - Write', description: 'Create, update, and delete organizations' },
  { value: 'devices:read', label: 'Devices - Read', description: 'View devices' },
  { value: 'devices:write', label: 'Devices - Write', description: 'Create, update, and delete devices' },
  { value: 'audit:read', label: 'Audit Logs - Read', description: 'View audit logs' },
  { value: 'staff:manage', label: 'Staff - Manage', description: 'Full staff user and role management' },
]

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  permissions: z.array(z.string()),
})
type FormData = z.infer<typeof schema>

interface Props {
  role?: StaffRole
}

export function StaffRoleForm({ role }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isEdit = !!role

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: role?.name ?? '',
      permissions: role?.permissions ?? [],
    },
  })

  const selectedPermissions = watch('permissions')

  function togglePermission(value: string) {
    const current = selectedPermissions ?? []
    if (current.includes(value)) {
      setValue('permissions', current.filter((p) => p !== value))
    } else {
      setValue('permissions', [...current, value])
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      if (isEdit) {
        await api.admin.staff.roles.update(role.id, data)
        toast.success('Role updated')
      } else {
        const created = await api.admin.staff.roles.create(data)
        toast.success('Role created')
        router.push(`/admin/staff/roles/${created.id}`)
        return
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : 'Failed to save role')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!role || !confirm(`Delete role "${role.name}"?`)) return
    try {
      await api.admin.staff.roles.delete(role.id)
      toast.success('Role deleted')
      router.push('/admin/staff/roles')
    } catch {
      toast.error('Failed to delete role')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Role Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Role Name</Label>
            <Input id="name" {...register('name')} placeholder="support_agent" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ALL_PERMISSIONS.map((perm) => (
            <div key={perm.value} className="flex items-start gap-3">
              <Checkbox
                id={perm.value}
                checked={selectedPermissions?.includes(perm.value) ?? false}
                onCheckedChange={() => togglePermission(perm.value)}
              />
              <div>
                <Label htmlFor={perm.value} className="font-medium cursor-pointer">
                  {perm.label}
                </Label>
                <p className="text-xs text-muted-foreground">{perm.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Role'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        {isEdit && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={handleDelete}>
            Delete Role
          </Button>
        )}
      </div>
    </form>
  )
}
```

**Step 3: Create new role page**

```tsx
// dashboard/app/admin/staff/roles/new/page.tsx
import { StaffRoleForm } from '@/components/admin/staff-role-form'

export default function NewStaffRolePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New Staff Role</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a custom permission set for RouteGuard staff
        </p>
      </div>
      <StaffRoleForm />
    </div>
  )
}
```

**Step 4: Create edit role page**

```tsx
// dashboard/app/admin/staff/roles/[id]/page.tsx
import { notFound } from 'next/navigation'
import { api, APIError } from '@/lib/api'
import { StaffRoleForm } from '@/components/admin/staff-role-form'
import { Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function EditStaffRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const role = await api.admin.staff.roles.get(id).catch((err) => {
    if (err instanceof APIError && err.status === 404) return null
    throw err
  })
  if (!role) notFound()

  if (role.is_system) {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{role.name}</h1>
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          System roles cannot be modified. This role always has all permissions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit Role</h1>
      </div>
      <StaffRoleForm role={role} />
    </div>
  )
}
```

**Step 5: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

**Step 6: Commit**

```bash
git add dashboard/app/admin/staff/roles/ dashboard/components/admin/staff-role-form.tsx
git commit -m "feat: staff roles list and create/edit pages"
```

---

### Task 17: Frontend - Sidebar Navigation

**Files:**
- Modify: `dashboard/components/admin/admin-app-sidebar.tsx`

**Step 1: Read the current sidebar file**

Read the file to understand its structure before modifying.

**Step 2: Add Staff section**

Find where nav items are defined and add a "Staff" group with Users and Roles links. The section should only render when the user has `staff:manage` in their roles/permissions. Check how user data is passed from the layout (via `user` prop - see `layout.tsx` which passes `user: User`).

Add a staff nav group that checks `user.permissions?.includes('staff:manage')`. Example addition to the nav items array:

```tsx
...(user.permissions?.includes('staff:manage')
  ? [
      {
        title: 'Staff',
        items: [
          { title: 'Users', url: '/admin/staff/users', icon: Users },
          { title: 'Roles', url: '/admin/staff/roles', icon: Shield },
        ],
      },
    ]
  : []),
```

Import `Users` and `Shield` from `lucide-react` if not already imported.

**Step 3: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 errors, build completes

**Step 4: Run final Go tests**

```bash
cd routeguard-api && go test -v ./...
```

Expected: all PASS

**Step 5: Commit**

```bash
git add dashboard/components/admin/admin-app-sidebar.tsx
git commit -m "feat: add Staff section to admin sidebar"
```

---

## Completion Checklist

- [ ] Migration `005_staff_rbac` applies cleanly
- [ ] `super_admin` system role seeded in DB
- [ ] Staff login loads permissions from `staff_user_roles`
- [ ] Deleted staff cannot log in
- [ ] Soft delete invalidates existing sessions immediately
- [ ] Daily goroutine hard-deletes users past 30-day window
- [ ] `staff:manage` required for all `/admin/staff/*` routes
- [ ] System roles cannot be edited or deleted (API + UI)
- [ ] Self-deletion prevented
- [ ] `npm run lint` - 0 errors
- [ ] `npm run build` - no TypeScript errors
- [ ] `go test -v ./...` - all PASS
