# Super Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform admin panel giving RouteGuard staff cross-org visibility, org/user management, audit logging, billing tracking, and impersonation support.

**Architecture:** Hybrid routing under `/dashboard` - platform-only pages at `/dashboard/admin/*`, org pages at existing paths. Go API gets a new `/platform/*` route group gated by `RequirePlatform`. Audit logging via append-only `audit_events` table with a reusable `AuditRepo`. Check-on-access pattern for suspend/disable enforcement in the `Authenticate` middleware.

**Tech Stack:** Go 1.24 (chi router, pgx, Redis), Next.js 16 (App Router, shadcn/ui, Tailwind v4, SWR), PostgreSQL 16

**Spec:** `docs/superpowers/specs/2026-03-11-super-admin-panel-design.md`

**Go module path:** `github.com/routeguard/api` (all Go imports use this prefix)

**Key existing patterns:**
- Cache field: `c.client` (not `c.rdb`)
- Repos have only `pool *pgxpool.Pool` - no DEK field. Encryption/decryption happens in handlers, not repos.
- `MeResponse` uses `User` (not `AuthUser`) and `OrgSummary`
- Existing repo methods that already exist and DO NOT need to be created: `MembershipRepo.ListMembersByOrg`, `MembershipRepo.Delete`, `MembershipRepo.GetByUserAndOrg`, `RoleRepo.ListMemberRoles`, `RoleRepo.AssignToMember`, `RoleRepo.UnassignFromMember`

---

## Chunk 1: Database Schema & Domain Types

### Task 1: Database Migration - New Tables and Columns

**Files:**
- Create: `routeguard-api/migrations/002_super_admin.up.sql`
- Create: `routeguard-api/migrations/002_super_admin.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- 002_super_admin.up.sql

-- Organizations: suspend + soft delete
ALTER TABLE organizations ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN deleted_at TIMESTAMPTZ;

-- Users: disable + last login tracking
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

-- Audit events (append-only)
CREATE TABLE audit_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL REFERENCES users(id),
    actor_email TEXT NOT NULL,
    org_id      UUID REFERENCES organizations(id),
    event_type  TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   UUID,
    metadata    JSONB DEFAULT '{}',
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX idx_audit_events_target_id ON audit_events(target_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);

-- Billing (per-org contract tracking)
CREATE TABLE org_billing (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID NOT NULL UNIQUE REFERENCES organizations(id),
    billing_status        TEXT NOT NULL DEFAULT 'pilot'
                          CHECK (billing_status IN ('pilot', 'active', 'cancelled')),
    pilot_ends_at         TIMESTAMPTZ,
    contract_notes        TEXT DEFAULT '',
    billing_contact_email TEXT DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Software releases (for future update tracking)
CREATE TABLE software_releases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version       TEXT NOT NULL UNIQUE,
    release_date  DATE NOT NULL,
    release_notes TEXT DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Write the down migration**

```sql
-- 002_super_admin.down.sql

DROP TABLE IF EXISTS software_releases;
DROP TABLE IF EXISTS org_billing;
DROP TABLE IF EXISTS audit_events;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE users DROP COLUMN IF EXISTS disabled_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS suspended_at;
```

- [ ] **Step 3: Run the migration locally**

```bash
cd routeguard-api
go run ./cmd/api
# Verify migration runs on startup (golang-migrate auto-runs)
```

- [ ] **Step 4: Commit**

```bash
git add routeguard-api/migrations/002_super_admin.up.sql routeguard-api/migrations/002_super_admin.down.sql
git commit -m "feat: add super admin migration - audit_events, org_billing, suspend/disable columns"
```

---

### Task 2: Domain Types - Add New Types and Extend Existing

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`

- [ ] **Step 1: Add `SuspendedAt`, `DeletedAt` to Organization**

In `types.go`, add to the `Organization` struct (existing fields shown for context):

```go
type Organization struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	NameEnc     string     `json:"-"`
	Slug        string     `json:"slug"`
	IsPlatform  bool       `json:"is_platform"`
	SuspendedAt *time.Time `json:"suspended_at"`
	DeletedAt   *time.Time `json:"deleted_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
```

- [ ] **Step 2: Add `DisabledAt`, `LastLoginAt` to User**

```go
type User struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	EmailEnc     string     `json:"-"`
	EmailHash    string     `json:"-"`
	Name         string     `json:"name"`
	NameEnc      string     `json:"-"`
	PasswordHash *string    `json:"-"`
	DisabledAt   *time.Time `json:"disabled_at"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
```

- [ ] **Step 3: Add `HomeOrgID` to SessionPayload**

```go
type SessionPayload struct {
	UserID      string   `json:"user_id"`
	OrgID       string   `json:"org_id"`
	HomeOrgID   string   `json:"home_org_id"`
	Permissions []string `json:"permissions"`
	CreatedAt   int64    `json:"created_at"`
}
```

- [ ] **Step 4: Add `HomeOrgID` to MeResponse**

The existing `MeResponse` uses `User` and `OrgSummary`. Add `HomeOrgID`:

```go
type MeResponse struct {
	User        User       `json:"user"`
	ActiveOrg   OrgSummary `json:"active_org"`
	Permissions []string   `json:"permissions"`
	HomeOrgID   string     `json:"home_org_id"`
}
```

- [ ] **Step 5: Add AuditEvent type**

```go
type AuditEvent struct {
	ID         string          `json:"id"`
	ActorID    string          `json:"actor_id"`
	ActorEmail string          `json:"actor_email"`
	OrgID      *string         `json:"org_id"`
	EventType  string          `json:"event_type"`
	TargetType string          `json:"target_type"`
	TargetID   *string         `json:"target_id"`
	Metadata   json.RawMessage `json:"metadata"`
	IPAddress  *string         `json:"ip_address"`
	CreatedAt  time.Time       `json:"created_at"`
}
```

Add `"encoding/json"` to the imports if not already present.

- [ ] **Step 6: Add OrgBilling type**

```go
type OrgBilling struct {
	ID                  string     `json:"id"`
	OrgID               string     `json:"org_id"`
	BillingStatus       string     `json:"billing_status"`
	PilotEndsAt         *time.Time `json:"pilot_ends_at"`
	ContractNotes       string     `json:"contract_notes"`
	BillingContactEmail string     `json:"billing_contact_email"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}
```

Note: `ContractNotes` and `BillingContactEmail` are `string` (not `*string`) because the migration defaults them to `''`.

- [ ] **Step 7: Add SoftwareRelease type**

```go
type SoftwareRelease struct {
	ID           string    `json:"id"`
	Version      string    `json:"version"`
	ReleaseDate  string    `json:"release_date"`
	ReleaseNotes string    `json:"release_notes"`
	CreatedAt    time.Time `json:"created_at"`
}
```

- [ ] **Step 8: Add PlatformStats type**

```go
type PlatformStats struct {
	TotalOrgs      int `json:"total_orgs"`
	SuspendedOrgs  int `json:"suspended_orgs"`
	TotalUsers     int `json:"total_users"`
	ActiveSessions int `json:"active_sessions"`
	ActiveTrips    int `json:"active_trips"`
}
```

- [ ] **Step 9: Add pagination types**

```go
type PageRequest struct {
	Page    int `json:"page"`
	PerPage int `json:"per_page"`
}

type PageResponse[T any] struct {
	Items      []T `json:"items"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PerPage    int `json:"per_page"`
	TotalPages int `json:"total_pages"`
}

type CursorResponse[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"next_cursor"`
	HasMore    bool   `json:"has_more"`
}
```

- [ ] **Step 10: Add UserDetail and UserOrgMembership types**

```go
type UserDetail struct {
	User
	Memberships []UserOrgMembership `json:"memberships"`
}

type UserOrgMembership struct {
	OrgID   string    `json:"org_id"`
	OrgName string    `json:"org_name"`
	OrgSlug string    `json:"org_slug"`
	Roles   []OrgRole `json:"roles"`
}
```

- [ ] **Step 11: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git commit -m "feat: add super admin domain types - audit, billing, pagination, suspend/disable fields"
```

---

### Task 3: Update Existing Repo Queries for New Columns

**Files:**
- Modify: `routeguard-api/internal/repository/org_repo.go`
- Modify: `routeguard-api/internal/repository/user_repo.go`

After adding `suspended_at`/`deleted_at` to Organization and `disabled_at`/`last_login_at` to User, the existing repo Scan calls must be updated to include these columns.

- [ ] **Step 1: Update OrgRepo queries**

For every method that scans an `Organization` (`Create`, `GetByID`, `GetBySlug`, `List`, `Update`), update the SELECT/RETURNING clause to include `suspended_at, deleted_at` and update the `Scan` call to include `&o.SuspendedAt, &o.DeletedAt`.

Example for `GetByID`:
```go
func (r *OrgRepo) GetByID(ctx context.Context, id string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`SELECT id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at
		 FROM organizations WHERE id = $1`, id,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt)
	// ... decrypt name, return
}
```

Apply the same pattern to `GetBySlug`, `List`, `Create` (RETURNING), and `Update` (RETURNING).

- [ ] **Step 2: Update UserRepo queries**

For every method that scans a `User` (`Create`, `GetByID`, `GetByEmailHash`), update the SELECT/RETURNING clause to include `disabled_at, last_login_at` and update the `Scan` call to include `&u.DisabledAt, &u.LastLoginAt`.

- [ ] **Step 3: Update MembershipRepo.ListOrgsByUser**

This method scans Organization fields. Add `suspended_at, deleted_at` to its SELECT and Scan.

- [ ] **Step 4: Run existing tests**

```bash
cd routeguard-api
go test -v ./...
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add routeguard-api/internal/repository/org_repo.go routeguard-api/internal/repository/user_repo.go routeguard-api/internal/repository/membership_repo.go
git commit -m "fix: update existing repo queries to scan new suspended_at/deleted_at/disabled_at columns"
```

---

## Chunk 2: Audit & Billing Repos, Check-on-Access Middleware

### Task 4: Audit Repository

**Files:**
- Create: `routeguard-api/internal/repository/audit_repo.go`
- Create: `routeguard-api/internal/repository/audit_repo_test.go`

- [ ] **Step 1: Write the failing test for Create**

```go
// audit_repo_test.go
package repository

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/routeguard/api/internal/domain"
)

func TestAuditRepo_Create(t *testing.T) {
	repo := NewAuditRepo(testPool)
	ctx := context.Background()

	event, err := repo.Create(ctx, domain.AuditEvent{
		ActorID:    "00000000-0000-0000-0000-000000000099",
		ActorEmail: "test@example.com",
		EventType:  "auth.login",
		TargetType: "user",
		Metadata:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if event.ID == "" {
		t.Fatal("expected event ID")
	}
	if event.EventType != "auth.login" {
		t.Fatalf("expected event_type auth.login, got %s", event.EventType)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd routeguard-api
go test -v -run TestAuditRepo_Create ./internal/repository/
```
Expected: FAIL - `NewAuditRepo` not defined

- [ ] **Step 3: Implement AuditRepo**

```go
// audit_repo.go
package repository

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type AuditRepo struct {
	pool *pgxpool.Pool
}

func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{pool: pool}
}

func (r *AuditRepo) Create(ctx context.Context, e domain.AuditEvent) (*domain.AuditEvent, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO audit_events (actor_id, actor_email, org_id, event_type, target_type, target_id, metadata, ip_address)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, actor_id, actor_email, org_id, event_type, target_type, target_id, metadata, ip_address, created_at`,
		e.ActorID, e.ActorEmail, e.OrgID, e.EventType, e.TargetType, e.TargetID, e.Metadata, e.IPAddress,
	)
	var out domain.AuditEvent
	err := row.Scan(&out.ID, &out.ActorID, &out.ActorEmail, &out.OrgID, &out.EventType,
		&out.TargetType, &out.TargetID, &out.Metadata, &out.IPAddress, &out.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *AuditRepo) List(ctx context.Context, cursor *time.Time, limit int, eventType, actorID string, startDate, endDate *time.Time) (*domain.CursorResponse[domain.AuditEvent], error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	query := `SELECT id, actor_id, actor_email, org_id, event_type, target_type, target_id, metadata, ip_address, created_at
	          FROM audit_events WHERE 1=1`
	args := []any{}
	argIdx := 1

	if cursor != nil {
		query += ` AND created_at < $` + strconv.Itoa(argIdx)
		args = append(args, *cursor)
		argIdx++
	}
	if eventType != "" {
		query += ` AND event_type = $` + strconv.Itoa(argIdx)
		args = append(args, eventType)
		argIdx++
	}
	if actorID != "" {
		query += ` AND actor_id = $` + strconv.Itoa(argIdx)
		args = append(args, actorID)
		argIdx++
	}
	if startDate != nil {
		query += ` AND created_at >= $` + strconv.Itoa(argIdx)
		args = append(args, *startDate)
		argIdx++
	}
	if endDate != nil {
		query += ` AND created_at <= $` + strconv.Itoa(argIdx)
		args = append(args, *endDate)
		argIdx++
	}

	query += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx)
	args = append(args, limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorEmail, &e.OrgID, &e.EventType,
			&e.TargetType, &e.TargetID, &e.Metadata, &e.IPAddress, &e.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, e)
	}

	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}

	var nextCursor string
	if hasMore && len(items) > 0 {
		nextCursor = items[len(items)-1].CreatedAt.Format(time.RFC3339Nano)
	}

	return &domain.CursorResponse[domain.AuditEvent]{
		Items:      items,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd routeguard-api
go test -v -run TestAuditRepo_Create ./internal/repository/
```
Expected: PASS

- [ ] **Step 5: Write test for List**

```go
func TestAuditRepo_List(t *testing.T) {
	repo := NewAuditRepo(testPool)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		_, _ = repo.Create(ctx, domain.AuditEvent{
			ActorID:    "00000000-0000-0000-0000-000000000099",
			ActorEmail: "test@example.com",
			EventType:  "auth.login",
			TargetType: "user",
			Metadata:   json.RawMessage(`{}`),
		})
	}

	resp, err := repo.List(ctx, nil, 10, "", "", nil, nil)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(resp.Items) < 3 {
		t.Fatalf("expected at least 3 items, got %d", len(resp.Items))
	}
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd routeguard-api
go test -v -run TestAuditRepo_List ./internal/repository/
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add routeguard-api/internal/repository/audit_repo.go routeguard-api/internal/repository/audit_repo_test.go
git commit -m "feat: add audit event repository with create and cursor-based list"
```

---

### Task 5: Billing Repository

**Files:**
- Create: `routeguard-api/internal/repository/billing_repo.go`
- Create: `routeguard-api/internal/repository/billing_repo_test.go`

- [ ] **Step 1: Write the failing test**

```go
// billing_repo_test.go
package repository

import (
	"context"
	"testing"
)

func TestBillingRepo_GetOrCreateByOrg(t *testing.T) {
	repo := NewBillingRepo(testPool)
	ctx := context.Background()

	orgID := "00000000-0000-0000-0000-000000000001"

	billing, err := repo.GetOrCreateByOrg(ctx, orgID)
	if err != nil {
		t.Fatalf("GetOrCreateByOrg failed: %v", err)
	}
	if billing.OrgID != orgID {
		t.Fatalf("expected org_id %s, got %s", orgID, billing.OrgID)
	}
	if billing.BillingStatus != "pilot" {
		t.Fatalf("expected default status pilot, got %s", billing.BillingStatus)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd routeguard-api
go test -v -run TestBillingRepo ./internal/repository/
```
Expected: FAIL

- [ ] **Step 3: Implement BillingRepo**

```go
// billing_repo.go
package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type BillingRepo struct {
	pool *pgxpool.Pool
}

func NewBillingRepo(pool *pgxpool.Pool) *BillingRepo {
	return &BillingRepo{pool: pool}
}

func (r *BillingRepo) GetOrCreateByOrg(ctx context.Context, orgID string) (*domain.OrgBilling, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO org_billing (org_id) VALUES ($1)
		 ON CONFLICT (org_id) DO UPDATE SET org_id = org_billing.org_id
		 RETURNING id, org_id, billing_status, pilot_ends_at, contract_notes, billing_contact_email, created_at, updated_at`,
		orgID,
	)
	var b domain.OrgBilling
	err := row.Scan(&b.ID, &b.OrgID, &b.BillingStatus, &b.PilotEndsAt,
		&b.ContractNotes, &b.BillingContactEmail, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *BillingRepo) Update(ctx context.Context, orgID string, status string, pilotEndsAt *time.Time, notes string, contactEmail string) (*domain.OrgBilling, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE org_billing SET billing_status = $2, pilot_ends_at = $3, contract_notes = $4,
		 billing_contact_email = $5, updated_at = now()
		 WHERE org_id = $1
		 RETURNING id, org_id, billing_status, pilot_ends_at, contract_notes, billing_contact_email, created_at, updated_at`,
		orgID, status, pilotEndsAt, notes, contactEmail,
	)
	var b domain.OrgBilling
	err := row.Scan(&b.ID, &b.OrgID, &b.BillingStatus, &b.PilotEndsAt,
		&b.ContractNotes, &b.BillingContactEmail, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *BillingRepo) ListAll(ctx context.Context) ([]domain.OrgBilling, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT b.id, b.org_id, b.billing_status, b.pilot_ends_at, b.contract_notes, b.billing_contact_email, b.created_at, b.updated_at
		 FROM org_billing b
		 JOIN organizations o ON o.id = b.org_id
		 WHERE o.deleted_at IS NULL
		 ORDER BY b.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.OrgBilling
	for rows.Next() {
		var b domain.OrgBilling
		if err := rows.Scan(&b.ID, &b.OrgID, &b.BillingStatus, &b.PilotEndsAt,
			&b.ContractNotes, &b.BillingContactEmail, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, b)
	}
	return items, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd routeguard-api
go test -v -run TestBillingRepo ./internal/repository/
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add routeguard-api/internal/repository/billing_repo.go routeguard-api/internal/repository/billing_repo_test.go
git commit -m "feat: add billing repository with get-or-create, update, and list-all"
```

---

### Task 6: Extend Cache with Helper Methods

**Files:**
- Modify: `routeguard-api/internal/cache/cache.go`

- [ ] **Step 1: Add SetString, GetString, and Keys methods**

The existing cache uses `c.client` (a `*redis.Client`). Add these helpers:

```go
func (c *Cache) SetString(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.client.Set(ctx, key, value, ttl).Err()
}

func (c *Cache) GetString(ctx context.Context, key string) (string, error) {
	return c.client.Get(ctx, key).Result()
}

func (c *Cache) Keys(ctx context.Context, pattern string) ([]string, error) {
	return c.client.Keys(ctx, pattern).Result()
}
```

Note: `Keys` is O(N) in Redis. Acceptable at current scale but should be revisited if session count grows large.

- [ ] **Step 2: Commit**

```bash
git add routeguard-api/internal/cache/cache.go
git commit -m "feat: add SetString, GetString, Keys helpers to cache"
```

---

### Task 7: Extend Authenticate Middleware - Check-on-Access for Suspend/Disable

**Files:**
- Modify: `routeguard-api/internal/middleware/auth.go`
- Modify: `routeguard-api/internal/repository/org_repo.go` (add `IsOrgAccessible`)
- Modify: `routeguard-api/internal/repository/user_repo.go` (add `IsUserEnabled`)

- [ ] **Step 1: Add IsOrgAccessible to OrgRepo**

Add to `routeguard-api/internal/repository/org_repo.go`:

```go
func (r *OrgRepo) IsOrgAccessible(ctx context.Context, id string) (bool, error) {
	var accessible bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1 AND suspended_at IS NULL AND deleted_at IS NULL)`,
		id,
	).Scan(&accessible)
	return accessible, err
}
```

- [ ] **Step 2: Add IsUserEnabled to UserRepo**

Add to `routeguard-api/internal/repository/user_repo.go`:

```go
func (r *UserRepo) IsUserEnabled(ctx context.Context, id string) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND disabled_at IS NULL)`,
		id,
	).Scan(&enabled)
	return enabled, err
}
```

- [ ] **Step 3: Update Authenticate middleware signature and add checks**

Change the `Authenticate` function signature to accept repos:

```go
func Authenticate(c *cache.Cache, pool *pgxpool.Pool) func(http.Handler) http.Handler
```

Inside the middleware, after successfully getting the session from Redis, add these checks before setting context:

```go
userRepo := repository.NewUserRepo(pool)
orgRepo := repository.NewOrgRepo(pool)

// Check user not disabled (cached 30s)
userKey := "user_enabled:" + session.UserID
if val, err := c.GetString(ctx, userKey); err == nil {
	if val == "0" {
		auth.DeleteSession(ctx, c, token)
		http.Error(w, "account disabled", http.StatusForbidden)
		return
	}
} else {
	// Cache miss - check DB
	enabled, dbErr := userRepo.IsUserEnabled(ctx, session.UserID)
	if dbErr != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	v := "1"
	if !enabled {
		v = "0"
	}
	c.SetString(ctx, userKey, v, 30*time.Second)
	if !enabled {
		auth.DeleteSession(ctx, c, token)
		http.Error(w, "account disabled", http.StatusForbidden)
		return
	}
}

// Check org not suspended/deleted (cached 30s)
orgKey := "org_accessible:" + session.OrgID
if val, err := c.GetString(ctx, orgKey); err == nil {
	if val == "0" {
		auth.DeleteSession(ctx, c, token)
		http.Error(w, "organization suspended", http.StatusForbidden)
		return
	}
} else {
	accessible, dbErr := orgRepo.IsOrgAccessible(ctx, session.OrgID)
	if dbErr != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	v := "1"
	if !accessible {
		v = "0"
	}
	c.SetString(ctx, orgKey, v, 30*time.Second)
	if !accessible {
		auth.DeleteSession(ctx, c, token)
		http.Error(w, "organization suspended", http.StatusForbidden)
		return
	}
}
```

- [ ] **Step 4: Update ALL existing Authenticate callers in server.go**

**CRITICAL:** The signature change breaks all existing callers. In `routeguard-api/internal/server/server.go`, update every `middleware.Authenticate(s.cache)` call to `middleware.Authenticate(s.cache, s.pool)`. There are currently 6 calls for the auth routes (logout, me, switch-org, orgs, etc.). Update them all.

- [ ] **Step 5: Write test for check-on-access**

Create `routeguard-api/internal/middleware/auth_test.go` (or add to existing test file) with a test that:
1. Creates a session for a user
2. Verifies the middleware passes the request through
3. Sets `disabled_at` on the user
4. Clears the cache key `user_enabled:<id>`
5. Verifies the middleware returns 403

```go
func TestAuthenticate_DisabledUser(t *testing.T) {
	// Setup: create user, create session, verify 200
	// Action: disable user, clear cache
	// Assert: next request returns 403
}

func TestAuthenticate_SuspendedOrg(t *testing.T) {
	// Setup: create org, create session, verify 200
	// Action: suspend org, clear cache
	// Assert: next request returns 403
}
```

- [ ] **Step 6: Run all tests**

```bash
cd routeguard-api
go test -v ./...
```
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add routeguard-api/internal/middleware/auth.go routeguard-api/internal/middleware/auth_test.go routeguard-api/internal/repository/org_repo.go routeguard-api/internal/repository/user_repo.go routeguard-api/internal/server/server.go
git commit -m "feat: check-on-access enforcement for suspended orgs and disabled users"
```

---

### Task 8: Extend SessionPayload with HomeOrgID + Update Login/Me/SwitchOrg

**Files:**
- Modify: `routeguard-api/internal/api/auth_handler.go`

- [ ] **Step 1: Update Login handler to set HomeOrgID**

In `auth_handler.go`, in the `Login` handler, when creating the session payload, set `HomeOrgID` to the same value as `OrgID`:

```go
payload := &domain.SessionPayload{
	UserID:      user.ID,
	OrgID:       activeOrg.ID,
	HomeOrgID:   activeOrg.ID,
	Permissions: perms,
	CreatedAt:   time.Now().Unix(),
}
```

- [ ] **Step 2: Update Me handler to return HomeOrgID**

In the `Me` handler, the `MeResponse` now includes `HomeOrgID` from Task 2. Ensure it's populated from the session:

```go
JSON(w, http.StatusOK, domain.MeResponse{
	User:        *user,
	ActiveOrg:   orgSummary,
	Permissions: session.Permissions,
	HomeOrgID:   session.HomeOrgID,
})
```

- [ ] **Step 3: Verify SwitchOrg does NOT change HomeOrgID**

The `SwitchOrg` handler updates `session.OrgID` and `session.Permissions` then calls `auth.UpdateSession`. Since `HomeOrgID` is not touched, it retains its login-time value. Verify this is the case - no code change needed if `SwitchOrg` only updates those two fields.

- [ ] **Step 4: Update last_login_at on successful login**

In the `Login` handler, after successful password verification, before creating session:

```go
_, _ = h.pool.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, user.ID)
```

- [ ] **Step 5: Run existing tests**

```bash
cd routeguard-api
go test -v ./...
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add routeguard-api/internal/api/auth_handler.go
git commit -m "feat: add home_org_id to session, track last_login_at on login"
```

---

## Chunk 3: Platform API Handlers - Orgs

### Task 9: Extend OrgRepo for Platform Queries

**Files:**
- Modify: `routeguard-api/internal/repository/org_repo.go`

Note: Repos don't have a DEK field. Decryption happens in the handlers. The repo returns raw `NameEnc` and the handler decrypts.

- [ ] **Step 1: Add ListPaginated method**

```go
func (r *OrgRepo) ListPaginated(ctx context.Context, search string, page, perPage int) ([]domain.Organization, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	countQuery := `SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL`
	args := []any{}
	argIdx := 1
	if search != "" {
		countQuery += ` AND slug ILIKE $` + strconv.Itoa(argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	var total int
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	dataQuery := `SELECT id, name_enc, slug, is_platform, suspended_at, deleted_at, created_at, updated_at
	              FROM organizations WHERE deleted_at IS NULL`
	dataArgs := []any{}
	dataIdx := 1
	if search != "" {
		dataQuery += ` AND slug ILIKE $` + strconv.Itoa(dataIdx)
		dataArgs = append(dataArgs, "%"+search+"%")
		dataIdx++
	}
	dataQuery += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(dataIdx) + ` OFFSET $` + strconv.Itoa(dataIdx+1)
	dataArgs = append(dataArgs, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []domain.Organization
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.SuspendedAt, &o.DeletedAt, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, 0, err
		}
		items = append(items, o)
	}

	return items, total, nil
}
```

Add `"strconv"` to imports.

- [ ] **Step 2: Add Suspend, Reactivate, SoftDelete, MemberCount methods**

```go
func (r *OrgRepo) Suspend(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE organizations SET suspended_at = now(), updated_at = now() WHERE id = $1 AND suspended_at IS NULL AND deleted_at IS NULL`,
		id,
	)
	return err
}

func (r *OrgRepo) Reactivate(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE organizations SET suspended_at = NULL, updated_at = now() WHERE id = $1 AND suspended_at IS NOT NULL`,
		id,
	)
	return err
}

func (r *OrgRepo) SoftDelete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE organizations SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL AND is_platform = false`,
		id,
	)
	return err
}

func (r *OrgRepo) MemberCount(ctx context.Context, orgID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM org_memberships WHERE org_id = $1`,
		orgID,
	).Scan(&count)
	return count, err
}
```

- [ ] **Step 3: Run tests**

```bash
cd routeguard-api
go test -v ./internal/repository/
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add routeguard-api/internal/repository/org_repo.go
git commit -m "feat: add paginated list, suspend, reactivate, soft delete to org repo"
```

---

### Task 10: Platform Org Handler

**Files:**
- Create: `routeguard-api/internal/api/platform_org_handler.go`

All handlers decrypt org names before returning. Audit events use `json.Marshal` for metadata (never string concatenation). Actor email is looked up from the user repo.

- [ ] **Step 1: Create helper to get actor email for audit**

Add at the top of the file:

```go
package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

// actorEmail gets the current user's decrypted email for audit logging.
func (h *Handler) actorEmail(ctx context.Context, userID string) string {
	u, err := h.users.GetByID(ctx, userID)
	if err != nil {
		return "unknown"
	}
	return u.Email
}

// decryptOrgName decrypts the org name from NameEnc field.
func (h *Handler) decryptOrgName(org *domain.Organization) {
	if org.NameEnc != "" {
		org.Name, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)
	}
}
```

- [ ] **Step 2: Implement ListOrgs handler**

```go
func (h *Handler) PlatformListOrgs(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.orgs.ListPaginated(r.Context(), search, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list orgs")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	// Decrypt names
	for i := range items {
		h.decryptOrgName(&items[i])
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.Organization]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}
```

- [ ] **Step 3: Implement CreateOrg handler**

```go
func (h *Handler) PlatformCreateOrg(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" || body.Slug == "" {
		Error(w, http.StatusBadRequest, "name and slug are required")
		return
	}

	ctx := r.Context()
	nameEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}

	org, err := h.orgs.Create(ctx, nameEnc, body.Slug)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "slug already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create org")
		return
	}

	if err := h.orgs.SeedSystemRoles(ctx, org.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to seed roles")
		return
	}

	_, _ = h.billing.GetOrCreateByOrg(ctx, org.ID)

	// Audit
	session := middleware.SessionFromContext(ctx)
	meta, _ := json.Marshal(map[string]string{"name": body.Name, "slug": body.Slug})
	h.audit.Create(ctx, domain.AuditEvent{
		ActorID:    session.UserID,
		ActorEmail: h.actorEmail(ctx, session.UserID),
		EventType:  "org.created",
		TargetType: "organization",
		TargetID:   &org.ID,
		Metadata:   meta,
	})

	org.Name = body.Name
	JSON(w, http.StatusCreated, org)
}
```

- [ ] **Step 4: Implement GetOrg, UpdateOrg, SuspendOrg, ReactivateOrg, DeleteOrg**

```go
func (h *Handler) PlatformGetOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	org, err := h.orgs.GetByID(r.Context(), id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get org")
		return
	}
	h.decryptOrgName(org)
	JSON(w, http.StatusOK, org)
}

func (h *Handler) PlatformUpdateOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	nameEnc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	org, err := h.orgs.Update(r.Context(), id, nameEnc, body.Slug)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update org")
		return
	}
	org.Name = body.Name
	JSON(w, http.StatusOK, org)
}

func (h *Handler) PlatformSuspendOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.orgs.Suspend(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to suspend org")
		return
	}
	h.cache.Del(r.Context(), "org_accessible:"+id)
	NoContent(w)
}

func (h *Handler) PlatformReactivateOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.orgs.Reactivate(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to reactivate org")
		return
	}
	h.cache.Del(r.Context(), "org_accessible:"+id)
	NoContent(w)
}

func (h *Handler) PlatformDeleteOrg(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.orgs.SoftDelete(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete org")
		return
	}
	h.cache.Del(r.Context(), "org_accessible:"+id)
	NoContent(w)
}
```

- [ ] **Step 5: Implement org member management handlers**

```go
func (h *Handler) PlatformListOrgMembers(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	members, err := h.members.ListMembersByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	// ListMembersByOrg returns OrgMembership which includes user_id.
	// The frontend will need user details. Consider enriching here or via a separate call.
	JSON(w, http.StatusOK, members)
}

func (h *Handler) PlatformAddOrgMember(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var body struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	membership, err := h.members.Create(r.Context(), body.UserID, orgID)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "user already a member")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to add member")
		return
	}
	JSON(w, http.StatusCreated, membership)
}

func (h *Handler) PlatformRemoveOrgMember(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")

	membership, err := h.members.GetByUserAndOrg(r.Context(), userID, orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	if err := h.members.Delete(r.Context(), membership.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	NoContent(w)
}

func (h *Handler) PlatformUpdateMemberRoles(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")

	var body struct {
		RoleIDs []string `json:"role_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	membership, err := h.members.GetByUserAndOrg(ctx, userID, orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	// Remove all existing roles then assign new ones.
	// TODO: Wrap in a transaction for atomicity. For now, errors are checked.
	existingRoles, err := h.roles.ListMemberRoles(ctx, membership.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list current roles")
		return
	}
	for _, role := range existingRoles {
		if err := h.roles.UnassignFromMember(ctx, membership.ID, role.ID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to unassign role")
			return
		}
	}
	for _, roleID := range body.RoleIDs {
		if err := h.roles.AssignToMember(ctx, membership.ID, roleID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to assign role")
			return
		}
	}

	NoContent(w)
}
```

- [ ] **Step 6: Commit**

```bash
git add routeguard-api/internal/api/platform_org_handler.go
git commit -m "feat: add platform org management handlers - CRUD, suspend, members"
```

---

### Task 11: Platform Billing Handler

**Files:**
- Create: `routeguard-api/internal/api/platform_billing_handler.go`

- [ ] **Step 1: Implement GetBilling, UpdateBilling, and ListAllBilling handlers**

```go
// platform_billing_handler.go
package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) PlatformGetBilling(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	billing, err := h.billing.GetOrCreateByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get billing")
		return
	}
	JSON(w, http.StatusOK, billing)
}

func (h *Handler) PlatformUpdateBilling(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var body struct {
		BillingStatus       string     `json:"billing_status"`
		PilotEndsAt         *time.Time `json:"pilot_ends_at"`
		ContractNotes       string     `json:"contract_notes"`
		BillingContactEmail string     `json:"billing_contact_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	switch body.BillingStatus {
	case "pilot", "active", "cancelled":
	default:
		Error(w, http.StatusBadRequest, "billing_status must be pilot, active, or cancelled")
		return
	}

	billing, err := h.billing.Update(r.Context(), orgID, body.BillingStatus, body.PilotEndsAt, body.ContractNotes, body.BillingContactEmail)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update billing")
		return
	}
	JSON(w, http.StatusOK, billing)
}

func (h *Handler) PlatformListAllBilling(w http.ResponseWriter, r *http.Request) {
	items, err := h.billing.ListAll(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list billing")
		return
	}
	JSON(w, http.StatusOK, items)
}
```

- [ ] **Step 2: Commit**

```bash
git add routeguard-api/internal/api/platform_billing_handler.go
git commit -m "feat: add platform billing handlers - get, update, list all"
```

---

## Chunk 4: Platform API Handlers - Users, Audit, Stats

### Task 12: Extend UserRepo for Platform Queries

**Files:**
- Modify: `routeguard-api/internal/repository/user_repo.go`

- [ ] **Step 1: Add ListPaginated method**

Note: Do NOT filter out disabled users - platform admins need to see them.

```go
func (r *UserRepo) ListPaginated(ctx context.Context, emailHash string, page, perPage int) ([]domain.User, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	countQuery := `SELECT COUNT(*) FROM users`
	args := []any{}
	argIdx := 1
	if emailHash != "" {
		countQuery += ` WHERE email_hash = $` + strconv.Itoa(argIdx)
		args = append(args, emailHash)
		argIdx++
	}

	var total int
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	dataQuery := `SELECT id, email_enc, email_hash, name_enc, disabled_at, last_login_at, created_at, updated_at
	              FROM users`
	dataArgs := []any{}
	dataIdx := 1
	if emailHash != "" {
		dataQuery += ` WHERE email_hash = $` + strconv.Itoa(dataIdx)
		dataArgs = append(dataArgs, emailHash)
		dataIdx++
	}
	dataQuery += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(dataIdx) + ` OFFSET $` + strconv.Itoa(dataIdx+1)
	dataArgs = append(dataArgs, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var items []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.DisabledAt, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, 0, err
		}
		items = append(items, u)
	}

	return items, total, nil
}
```

Add `"strconv"` to imports.

- [ ] **Step 2: Add Disable and Enable methods**

```go
func (r *UserRepo) Disable(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET disabled_at = now(), updated_at = now() WHERE id = $1 AND disabled_at IS NULL`,
		id,
	)
	return err
}

func (r *UserRepo) Enable(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET disabled_at = NULL, updated_at = now() WHERE id = $1 AND disabled_at IS NOT NULL`,
		id,
	)
	return err
}
```

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/repository/user_repo.go
git commit -m "feat: add paginated list, disable, enable to user repo"
```

---

### Task 13: Platform User Handler

**Files:**
- Create: `routeguard-api/internal/api/platform_user_handler.go`

- [ ] **Step 1: Implement ListUsers handler**

```go
// platform_user_handler.go
package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

func (h *Handler) PlatformListUsers(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	var emailHash string
	if email != "" {
		emailHash = crypto.HMAC(h.cfg.HMACKey, email)
	}

	items, total, err := h.users.ListPaginated(r.Context(), emailHash, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	// Decrypt names and emails
	for i := range items {
		items[i].Email, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, items[i].EmailEnc)
		items[i].Name, _ = crypto.Decrypt(h.cfg.DataEncryptionKey, items[i].NameEnc)
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.User]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}
```

- [ ] **Step 2: Implement GetUser handler with memberships**

```go
func (h *Handler) PlatformGetUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	user, err := h.users.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "user not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	orgs, err := h.members.ListOrgsByUser(ctx, id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list memberships")
		return
	}

	var memberships []domain.UserOrgMembership
	for _, org := range orgs {
		membership, _ := h.members.GetByUserAndOrg(ctx, id, org.ID)
		var roles []domain.OrgRole
		if membership != nil {
			roles, _ = h.roles.ListMemberRoles(ctx, membership.ID)
		}
		h.decryptOrgName(&org)
		memberships = append(memberships, domain.UserOrgMembership{
			OrgID:   org.ID,
			OrgName: org.Name,
			OrgSlug: org.Slug,
			Roles:   roles,
		})
	}

	JSON(w, http.StatusOK, domain.UserDetail{
		User:        *user,
		Memberships: memberships,
	})
}
```

- [ ] **Step 3: Implement Disable, Enable, ResetPassword, RevokeSessions**

```go
func (h *Handler) PlatformDisableUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.users.Disable(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to disable user")
		return
	}
	h.cache.Del(r.Context(), "user_enabled:"+id)
	auth.InvalidateUserSessions(r.Context(), h.cache, id)
	NoContent(w)
}

func (h *Handler) PlatformEnableUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.users.Enable(r.Context(), id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to enable user")
		return
	}
	h.cache.Del(r.Context(), "user_enabled:"+id)
	NoContent(w)
}

func (h *Handler) PlatformResetPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.pool.Exec(r.Context(),
		`UPDATE users SET password_hash = NULL, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to reset password")
		return
	}
	auth.InvalidateUserSessions(r.Context(), h.cache, id)
	NoContent(w)
}

func (h *Handler) PlatformRevokeSessions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := auth.InvalidateUserSessions(r.Context(), h.cache, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to revoke sessions")
		return
	}
	NoContent(w)
}
```

- [ ] **Step 4: Commit**

```bash
git add routeguard-api/internal/api/platform_user_handler.go
git commit -m "feat: add platform user management handlers - list, detail, disable, enable, reset, revoke"
```

---

### Task 14: Platform Audit and Stats Handlers

**Files:**
- Create: `routeguard-api/internal/api/platform_audit_handler.go`
- Create: `routeguard-api/internal/api/platform_stats_handler.go`

- [ ] **Step 1: Implement Audit list handler**

```go
// platform_audit_handler.go
package api

import (
	"net/http"
	"strconv"
	"time"
)

func (h *Handler) PlatformListAudit(w http.ResponseWriter, r *http.Request) {
	cursorStr := r.URL.Query().Get("cursor")
	limitStr := r.URL.Query().Get("limit")
	eventType := r.URL.Query().Get("event_type")
	actorID := r.URL.Query().Get("actor_id")
	startStr := r.URL.Query().Get("start_date")
	endStr := r.URL.Query().Get("end_date")

	limit, _ := strconv.Atoi(limitStr)

	var cursor *time.Time
	if cursorStr != "" {
		t, err := time.Parse(time.RFC3339Nano, cursorStr)
		if err == nil {
			cursor = &t
		}
	}

	var startDate, endDate *time.Time
	if startStr != "" {
		t, err := time.Parse(time.RFC3339, startStr)
		if err == nil {
			startDate = &t
		}
	}
	if endStr != "" {
		t, err := time.Parse(time.RFC3339, endStr)
		if err == nil {
			endDate = &t
		}
	}

	result, err := h.audit.List(r.Context(), cursor, limit, eventType, actorID, startDate, endDate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list audit events")
		return
	}
	JSON(w, http.StatusOK, result)
}
```

- [ ] **Step 2: Implement Stats handler**

```go
// platform_stats_handler.go
package api

import (
	"net/http"

	"github.com/routeguard/api/internal/domain"
)

func (h *Handler) PlatformStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var stats domain.PlatformStats

	_ = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL`).Scan(&stats.TotalOrgs)
	_ = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE suspended_at IS NOT NULL AND deleted_at IS NULL`).Scan(&stats.SuspendedOrgs)
	_ = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE disabled_at IS NULL`).Scan(&stats.TotalUsers)

	// Active sessions (approximate via Redis KEYS)
	keys, _ := h.cache.Keys(ctx, "session:*")
	stats.ActiveSessions = len(keys)

	// ActiveTrips: set to 0 for now until trip tracking is implemented
	stats.ActiveTrips = 0

	JSON(w, http.StatusOK, stats)
}
```

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/api/platform_audit_handler.go routeguard-api/internal/api/platform_stats_handler.go
git commit -m "feat: add platform audit list and stats handlers"
```

---

### Task 15: Wire Platform Routes in Server

**Files:**
- Modify: `routeguard-api/internal/server/server.go`
- Modify: `routeguard-api/internal/api/handler.go`

- [ ] **Step 1: Add audit and billing repos to Handler**

In `handler.go`:

```go
type Handler struct {
	pool    *pgxpool.Pool
	cache   *cache.Cache
	cfg     *config.Config
	users   *repository.UserRepo
	orgs    *repository.OrgRepo
	members *repository.MembershipRepo
	roles   *repository.RoleRepo
	sso     *repository.SSORepo
	audit   *repository.AuditRepo
	billing *repository.BillingRepo
}
```

Update `NewHandler`:

```go
func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config) *Handler {
	return &Handler{
		pool:    pool,
		cache:   c,
		cfg:     cfg,
		users:   repository.NewUserRepo(pool),
		orgs:    repository.NewOrgRepo(pool),
		members: repository.NewMembershipRepo(pool),
		roles:   repository.NewRoleRepo(pool),
		sso:     repository.NewSSORepo(pool),
		audit:   repository.NewAuditRepo(pool),
		billing: repository.NewBillingRepo(pool),
	}
}
```

- [ ] **Step 2: Wire platform routes in server.go**

Add after the existing authenticated auth routes:

```go
// Platform admin routes
r.Route("/platform", func(r chi.Router) {
	r.Use(middleware.Authenticate(s.cache, s.pool))
	r.Use(middleware.RequirePlatform(PlatformOrgID))

	// Orgs
	r.Get("/orgs", h.PlatformListOrgs)
	r.Post("/orgs", h.PlatformCreateOrg)
	r.Get("/orgs/{id}", h.PlatformGetOrg)
	r.Put("/orgs/{id}", h.PlatformUpdateOrg)
	r.Delete("/orgs/{id}", h.PlatformDeleteOrg)
	r.Post("/orgs/{id}/suspend", h.PlatformSuspendOrg)
	r.Post("/orgs/{id}/reactivate", h.PlatformReactivateOrg)
	r.Get("/orgs/{id}/members", h.PlatformListOrgMembers)
	r.Post("/orgs/{id}/members", h.PlatformAddOrgMember)
	r.Delete("/orgs/{id}/members/{userId}", h.PlatformRemoveOrgMember)
	r.Put("/orgs/{id}/members/{userId}/roles", h.PlatformUpdateMemberRoles)
	r.Get("/orgs/{id}/billing", h.PlatformGetBilling)
	r.Put("/orgs/{id}/billing", h.PlatformUpdateBilling)

	// Users
	r.Get("/users", h.PlatformListUsers)
	r.Get("/users/{id}", h.PlatformGetUser)
	r.Post("/users/{id}/disable", h.PlatformDisableUser)
	r.Post("/users/{id}/enable", h.PlatformEnableUser)
	r.Post("/users/{id}/reset-password", h.PlatformResetPassword)
	r.Delete("/users/{id}/sessions", h.PlatformRevokeSessions)

	// Audit
	r.Get("/audit", h.PlatformListAudit)

	// Billing (list all)
	r.Get("/billing", h.PlatformListAllBilling)

	// Stats
	r.Get("/stats", h.PlatformStats)
})
```

- [ ] **Step 3: Build and verify**

```bash
cd routeguard-api
go build ./cmd/api
```
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add routeguard-api/internal/api/handler.go routeguard-api/internal/server/server.go
git commit -m "feat: wire platform admin routes - orgs, users, audit, billing, stats"
```

---

## Chunk 5: Dashboard Frontend - Sidebar, Layout, Admin Gate

### Task 16: Update Sidebar Navigation for Platform

**Files:**
- Modify: `dashboard/components/dashboard/app-sidebar.tsx`

- [ ] **Step 1: Update platformNavItems and imports**

```tsx
import {
  LayoutDashboardIcon,
  BusIcon,
  UsersIcon,
  BuildingIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  ArrowDownToLineIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
} from "lucide-react"

const platformNavItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon />,
  },
  {
    title: "Organizations",
    url: "/dashboard/admin/orgs",
    icon: <BuildingIcon />,
  },
  {
    title: "Users",
    url: "/dashboard/admin/users",
    icon: <UsersIcon />,
  },
  {
    title: "Audit Log",
    url: "/dashboard/admin/audit",
    icon: <ShieldCheckIcon />,
  },
  {
    title: "Billing",
    url: "/dashboard/admin/billing",
    icon: <CreditCardIcon />,
  },
  {
    title: "Updates",
    url: "/dashboard/admin/updates",
    icon: <ArrowDownToLineIcon />,
  },
]
```

- [ ] **Step 2: Hide admin nav when impersonating**

Update the `AppSidebar` component to check for impersonation:

```tsx
export function AppSidebar({
  me,
  ...props
}: React.ComponentProps<typeof Sidebar> & { me: MeResponse }) {
  const isImpersonating = me.home_org_id !== me.active_org.id
  const isPlatform = me.active_org.is_platform

  const navItems = isPlatform && !isImpersonating
    ? platformNavItems
    : districtNavItems

  // ... rest unchanged
}
```

- [ ] **Step 3: Run lint**

```bash
cd dashboard
npm run lint
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/dashboard/app-sidebar.tsx
git commit -m "feat: update sidebar with platform admin nav items, hide when impersonating"
```

---

### Task 17: Update Frontend Types

**Files:**
- Modify: `dashboard/lib/api.ts`

- [ ] **Step 1: Add home_org_id to MeResponse**

```ts
export interface MeResponse {
  user: AuthUser
  active_org: OrgOption
  permissions: string[]
  home_org_id: string
}
```

- [ ] **Step 2: Add platform API types**

```ts
export interface Organization {
  id: string
  name: string
  slug: string
  is_platform: boolean
  suspended_at: string | null
  deleted_at: string | null
  member_count?: number
  created_at: string
  updated_at: string
}

export interface OrgBilling {
  id: string
  org_id: string
  billing_status: "pilot" | "active" | "cancelled"
  pilot_ends_at: string | null
  contract_notes: string
  billing_contact_email: string
  created_at: string
  updated_at: string
}

export interface AuditEvent {
  id: string
  actor_id: string
  actor_email: string
  org_id: string | null
  event_type: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface PlatformStats {
  total_orgs: number
  suspended_orgs: number
  total_users: number
  active_sessions: number
  active_trips: number
}

export interface PlatformUser {
  id: string
  email: string
  name: string
  disabled_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface PlatformUserDetail extends PlatformUser {
  memberships: {
    org_id: string
    org_name: string
    org_slug: string
    roles: { id: string; name: string; permissions: string[] }[]
  }[]
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface CursorResponse<T> {
  items: T[]
  next_cursor: string
  has_more: boolean
}
```

- [ ] **Step 3: Add platform API methods**

```ts
export const api = {
  auth: { /* existing - keep as is */ },
  platform: {
    stats: () => request<PlatformStats>("/platform/stats"),
    orgs: {
      list: (params?: { search?: string; page?: number; per_page?: number }) =>
        request<PageResponse<Organization>>(`/platform/orgs?${new URLSearchParams(params as any)}`),
      get: (id: string) => request<Organization>(`/platform/orgs/${id}`),
      create: (data: { name: string; slug: string }) =>
        request<Organization>("/platform/orgs", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: { name: string; slug: string }) =>
        request<Organization>(`/platform/orgs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      delete: (id: string) =>
        request<void>(`/platform/orgs/${id}`, { method: "DELETE" }),
      suspend: (id: string) =>
        request<void>(`/platform/orgs/${id}/suspend`, { method: "POST" }),
      reactivate: (id: string) =>
        request<void>(`/platform/orgs/${id}/reactivate`, { method: "POST" }),
      members: (id: string) =>
        request<any[]>(`/platform/orgs/${id}/members`),
      addMember: (id: string, userId: string) =>
        request<any>(`/platform/orgs/${id}/members`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
      removeMember: (id: string, userId: string) =>
        request<void>(`/platform/orgs/${id}/members/${userId}`, { method: "DELETE" }),
      updateMemberRoles: (id: string, userId: string, roleIds: string[]) =>
        request<void>(`/platform/orgs/${id}/members/${userId}/roles`, { method: "PUT", body: JSON.stringify({ role_ids: roleIds }) }),
      getBilling: (id: string) => request<OrgBilling>(`/platform/orgs/${id}/billing`),
      updateBilling: (id: string, data: Partial<OrgBilling>) =>
        request<OrgBilling>(`/platform/orgs/${id}/billing`, { method: "PUT", body: JSON.stringify(data) }),
      roles: (id: string) =>
        request<{ id: string; name: string; permissions: string[]; is_system: boolean }[]>(`/platform/orgs/${id}/roles`),
    },
    users: {
      list: (params?: { email?: string; page?: number; per_page?: number }) =>
        request<PageResponse<PlatformUser>>(`/platform/users?${new URLSearchParams(params as any)}`),
      get: (id: string) => request<PlatformUserDetail>(`/platform/users/${id}`),
      disable: (id: string) => request<void>(`/platform/users/${id}/disable`, { method: "POST" }),
      enable: (id: string) => request<void>(`/platform/users/${id}/enable`, { method: "POST" }),
      resetPassword: (id: string) => request<void>(`/platform/users/${id}/reset-password`, { method: "POST" }),
      revokeSessions: (id: string) => request<void>(`/platform/users/${id}/sessions`, { method: "DELETE" }),
    },
    audit: {
      list: (params?: { cursor?: string; limit?: number; event_type?: string; actor_id?: string; start_date?: string; end_date?: string }) =>
        request<CursorResponse<AuditEvent>>(`/platform/audit?${new URLSearchParams(params as any)}`),
    },
    billing: {
      listAll: () => request<OrgBilling[]>("/platform/billing"),
    },
  },
}
```

- [ ] **Step 4: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add platform API types and methods to frontend client"
```

---

### Task 18: Admin Layout Gate

**Files:**
- Create: `dashboard/app/dashboard/admin/layout.tsx`

- [ ] **Step 1: Create admin layout with platform gate**

The parent `dashboard/layout.tsx` already calls `getServerUser()` and has `me`. To avoid a redundant API call, use the same `getServerUser()` but just for the gate check - the data is cached per-request by Next.js:

```tsx
import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await getServerUser()

  if (!me || !me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <>{children}</>
}
```

- [ ] **Step 2: Run build to verify**

```bash
cd dashboard
npm run build
```
Expected: Compiles

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/layout.tsx
git commit -m "feat: add admin layout gate - redirects non-platform users to forbidden"
```

---

### Task 19: Impersonation Banner

**Files:**
- Create: `dashboard/components/dashboard/impersonation-banner.tsx`
- Modify: `dashboard/app/dashboard/layout.tsx`

- [ ] **Step 1: Create the banner component**

```tsx
"use client"

import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { MeResponse } from "@/lib/api"

export function ImpersonationBanner({ me }: { me: MeResponse }) {
  const router = useRouter()
  const isImpersonating = me.home_org_id !== me.active_org.id

  if (!isImpersonating) return null

  const handleReturn = async () => {
    await api.auth.switchOrg(me.home_org_id)
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="bg-brand-amber text-black px-4 py-2 text-sm font-medium flex items-center justify-between">
      <span>Viewing as {me.active_org.name}</span>
      <button
        onClick={handleReturn}
        className="underline hover:no-underline font-semibold"
      >
        Return to platform
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add banner to dashboard layout**

In `dashboard/app/dashboard/layout.tsx`, import and render the banner inside `SidebarInset`, above the existing content:

```tsx
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner"

// Inside return, after <SidebarInset>:
<ImpersonationBanner me={me} />
```

- [ ] **Step 3: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/dashboard/impersonation-banner.tsx dashboard/app/dashboard/layout.tsx
git commit -m "feat: add impersonation banner with return-to-platform button"
```

---

## Chunk 6: Dashboard Frontend - Admin Pages

### Task 20: Platform Dashboard Home

**Files:**
- Modify: `dashboard/app/dashboard/page.tsx`
- Create: `dashboard/components/dashboard/platform-dashboard.tsx`
- Create: `dashboard/components/dashboard/district-dashboard.tsx`

- [ ] **Step 1: Extract existing dashboard content into DistrictDashboard**

Move the existing content of `app/dashboard/page.tsx` (the `SectionCards`, `ChartAreaInteractive`, `DataTable` imports and rendering, plus the `data.json` import) into a new client component `dashboard/components/dashboard/district-dashboard.tsx`. Keep all existing imports and logic intact - just move it to the new file.

- [ ] **Step 2: Create PlatformDashboard component**

```tsx
"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BuildingIcon, UsersIcon, WifiIcon, BusIcon } from "lucide-react"
import Link from "next/link"

export function PlatformDashboard() {
  const { data: stats } = useSWR("platform-stats", () => api.platform.stats())
  const { data: audit } = useSWR("platform-audit-recent", () =>
    api.platform.audit.list({ limit: 20 })
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_orgs ?? "-"}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.suspended_orgs ?? 0} suspended
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users ?? "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <WifiIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_sessions ?? "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Trips</CardTitle>
            <BusIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_trips ?? "-"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Security Activity</CardTitle>
          <Link href="/dashboard/admin/audit" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {audit?.items?.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <span className="font-medium">{event.actor_email}</span>
                  <span className="text-muted-foreground ml-2">{event.event_type}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {(!audit?.items || audit.items.length === 0) && (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Update dashboard page to conditionally render**

```tsx
import { getServerUser } from "@/lib/server-api"
import { redirect } from "next/navigation"
import { PlatformDashboard } from "@/components/dashboard/platform-dashboard"
import { DistrictDashboard } from "@/components/dashboard/district-dashboard"

export default async function DashboardPage() {
  const me = await getServerUser()
  if (!me) redirect("/login")

  if (me.active_org.is_platform) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Platform Overview</h1>
        <PlatformDashboard />
      </div>
    )
  }

  return <DistrictDashboard />
}
```

- [ ] **Step 4: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/dashboard/page.tsx dashboard/components/dashboard/platform-dashboard.tsx dashboard/components/dashboard/district-dashboard.tsx
git commit -m "feat: add platform dashboard home with stats cards and activity feed"
```

---

### Task 21: Organizations List Page

**Files:**
- Create: `dashboard/app/dashboard/admin/orgs/page.tsx`

- [ ] **Step 1: Create orgs list page**

Build a client component with:
- Search input with debounce (300ms timeout)
- Table with columns: Name, Slug, Status (active/suspended badge), Billing Status, Members count, Created date
- Row actions: Edit link, Suspend/Reactivate button, Enter org (calls switchOrg + redirect)
- Pagination controls
- Use Sonner toast for success/error feedback on actions
- Link to `/dashboard/admin/orgs/new` for create button

Note: The billing status and member count columns require the API to include this data. If not returned by the list endpoint, make additional calls per-org or add these to the API response. For initial implementation, show what's available and add TODO comments for missing columns.

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/orgs/page.tsx
git commit -m "feat: add organizations list page with search and pagination"
```

---

### Task 22: Organization Detail Page

**Files:**
- Create: `dashboard/app/dashboard/admin/orgs/[id]/page.tsx`

- [ ] **Step 1: Create org detail page with tabs**

Build a tabbed page using shadcn `Tabs`. Tabs:

- **Overview tab:** Org name, slug, billing status (from `api.platform.orgs.getBilling`), created/updated dates. Inline-editable name/slug form.
- **Members tab:** Table of members. "Add member" form (user ID or email lookup). Remove member button. Role assignment dropdown per member.
- **Roles tab:** List of roles with permissions. Create custom role form. Delete non-system roles. Uses `api.platform.orgs.roles(id)` to fetch.
- **SSO tab:** List of SSO connections for the org. Display type (OIDC/SAML), display name, enabled status. Add/edit/delete SSO connections. Uses existing SSORepo endpoints (add platform routes for SSO management or use org-scoped routes).
- **Danger Zone tab:** Suspend/Reactivate toggle with confirmation. Delete button with confirmation dialog (AlertDialog). Shows current status prominently.

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/orgs/[id]/page.tsx
git commit -m "feat: add organization detail page with tabs - overview, members, roles, sso, danger zone"
```

---

### Task 23: Create Organization Page

**Files:**
- Create: `dashboard/app/dashboard/admin/orgs/new/page.tsx`

- [ ] **Step 1: Create org form page**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function NewOrgPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [autoSlug, setAutoSlug] = useState(true)

  const handleNameChange = (value: string) => {
    setName(value)
    if (autoSlug) setSlug(slugify(value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const org = await api.platform.orgs.create({ name, slug })
      toast.success("Organization created")
      router.push(`/dashboard/admin/orgs/${org.id}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to create organization")
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Create Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input id="name" value={name} onChange={(e) => handleNameChange(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setAutoSlug(false) }}
                required
              />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/orgs/new/page.tsx
git commit -m "feat: add create organization page with auto-slug"
```

---

### Task 24: Users List Page

**Files:**
- Create: `dashboard/app/dashboard/admin/users/page.tsx`

- [ ] **Step 1: Create users list page**

Build a client component with:
- Email search input (exact match, debounced 300ms) with clear button
- Table columns: Name, Email, Orgs (badge list), Last Login, Created, Status (active/disabled)
- Row actions: View detail link, Disable/Enable button with toast feedback
- Pagination controls
- Link to user detail: `/dashboard/admin/users/[id]`

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/users/page.tsx
git commit -m "feat: add users list page with email search"
```

---

### Task 25: User Detail Page

**Files:**
- Create: `dashboard/app/dashboard/admin/users/[id]/page.tsx`

- [ ] **Step 1: Create user detail page**

Sections using Card components:
- **Profile:** Name, email, auth providers, disabled status, last login, created date
- **Org Memberships:** Table of orgs with roles for each. Link to org detail.
- **Security Actions:** Buttons with confirmation dialogs (AlertDialog):
  - Disable/Enable account
  - Force password reset
  - Revoke all sessions
  - All actions use toast for success/error feedback

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/users/[id]/page.tsx
git commit -m "feat: add user detail page with memberships and security actions"
```

---

### Task 26: Audit Log Page

**Files:**
- Create: `dashboard/app/dashboard/admin/audit/page.tsx`

- [ ] **Step 1: Create audit log page**

Build a client component with:
- Filters: event type dropdown (select from known event types), date range inputs (optional)
- Table columns: Timestamp, Actor (email), Event Type (human-readable label), Target
- Expandable row (Collapsible) to show full metadata JSON
- Cursor-based "Load more" button at bottom (not traditional pagination)
- Uses `api.platform.audit.list()` with filter params

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/audit/page.tsx
git commit -m "feat: add audit log page with filters and cursor pagination"
```

---

### Task 27: Billing Page

**Files:**
- Create: `dashboard/app/dashboard/admin/billing/page.tsx`

- [ ] **Step 1: Create billing page**

Build a client component with:
- Uses `api.platform.billing.listAll()` for the full billing list
- Table columns: Org Name (linked to org detail), Billing Status (badge), Pilot Ends At, Billing Contact
- Amber badge for pilots expiring within 14 days
- Inline status change via Select dropdown per row (calls `api.platform.orgs.updateBilling`)
- Toast feedback on status changes

Note: Org names need to be resolved. Either the billing list endpoint joins org data, or make a separate call. For initial implementation, consider adding org name to the billing API response or fetching orgs separately.

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/billing/page.tsx
git commit -m "feat: add billing overview page with status tracking"
```

---

### Task 28: Updates Page (Placeholder)

**Files:**
- Create: `dashboard/app/dashboard/admin/updates/page.tsx`

- [ ] **Step 1: Create placeholder page**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function UpdatesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Software Updates</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Device software rollout tracking will be available once device infrastructure is in place.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Run lint and build**

```bash
cd dashboard
npm run lint && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/admin/updates/page.tsx
git commit -m "feat: add updates page placeholder"
```

---

## Chunk 7: Final Integration & Cleanup

### Task 29: Update repository documentation

- [ ] Verify that repository documentation describes the `/dashboard/admin/*` routes and the active deployment stack.

---

### Task 30: Full Build Verification

- [ ] **Step 1: Run Go tests**

```bash
cd routeguard-api
go test -v ./...
```
Expected: All PASS

- [ ] **Step 2: Run Go build**

```bash
cd routeguard-api
go build ./cmd/api
```
Expected: Compiles

- [ ] **Step 3: Run dashboard lint**

```bash
cd dashboard
npm run lint
```
Expected: 0 errors

- [ ] **Step 4: Run dashboard build**

```bash
cd dashboard
npm run build
```
Expected: No TypeScript errors

- [ ] **Step 5: Commit any fixups (use specific file paths, not git add -A)**

If any fixes were needed:

```bash
git add <specific files that were fixed>
git commit -m "fix: address build/lint issues from super admin panel implementation"
```
