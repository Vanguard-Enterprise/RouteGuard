# Audit Logging Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix audit logging so events are actually recorded, IP addresses are captured, and the admin list endpoint works without a mandatory org_id.

**Architecture:** Three root causes are addressed in sequence: (1) fix the `LogAudit` helper signature to carry the HTTP request so it can extract the caller IP, (2) fix the admin list endpoint so it returns all logs when no org_id filter is given, then (3) wire `LogAudit` calls into every mutating handler that currently skips it. Direct `repo.Log` calls are used only for the Login handler where no session is in context yet.

**Tech Stack:** Go 1.24, chi router, pgx v5, `net/http/httptest` for unit tests

---

## Background - What Is Broken

| # | Root cause | Symptom |
|---|-----------|---------|
| 1 | `LogAudit` is never called anywhere | Zero rows written to `audit_logs` |
| 2 | `GET /admin/audit-logs` returns 400 unless `org_id` is provided | Admin audit-log page always empty/errors |
| 3 | `LogAudit` never reads the HTTP request for the caller IP | Every row has `ip_address = NULL` |

---

## Task 1: Fix `LogAudit` to accept `*http.Request` and capture IP

**Files:**
- Modify: `routeguard-api/internal/api/audit_handler.go`
- Create: `routeguard-api/internal/api/audit_handler_test.go`

### Step 1: Write the failing test

Create `routeguard-api/internal/api/audit_handler_test.go`:

```go
package api

import (
	"net/http/httptest"
	"testing"
)

func TestRealIP_ForwardedFor(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 10.0.0.1")
	got := realIP(r)
	if got != "1.2.3.4" {
		t.Fatalf("got %q, want %q", got, "1.2.3.4")
	}
}

func TestRealIP_RealIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Real-IP", "5.6.7.8")
	got := realIP(r)
	if got != "5.6.7.8" {
		t.Fatalf("got %q, want %q", got, "5.6.7.8")
	}
}

func TestRealIP_RemoteAddr(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "9.10.11.12:54321"
	got := realIP(r)
	if got != "9.10.11.12" {
		t.Fatalf("got %q, want %q", got, "9.10.11.12")
	}
}
```

### Step 2: Run tests to confirm they fail

```bash
cd routeguard-api
go test -v -run TestRealIP ./internal/api/
```

Expected: compile error - `realIP` not defined.

### Step 3: Implement the changes

In `routeguard-api/internal/api/audit_handler.go`, make these two changes:

**Add `realIP` helper** (add at bottom of file, after `parseIntParam`):

```go
// realIP extracts the caller's IP address from the request.
// Checks X-Forwarded-For first (leftmost entry is the client), then
// X-Real-IP, then falls back to RemoteAddr.
func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.Index(xff, ","); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
```

**Change `LogAudit` signature** - replace the entire function:

```go
// LogAudit writes an audit entry derived from the session or device context.
// It is non-fatal - errors are silently ignored.
func (h *Handler) LogAudit(r *http.Request, action, targetType, targetID string, metadata map[string]any) {
	entry := domain.AuditLog{
		Action: action,
	}

	ctx := r.Context()

	// Populate from session if present.
	if session := auth.SessionFromContext(ctx); session != nil {
		entry.ActorID = &session.UserID
		entry.ActorType = "user"
		if session.OrgID != "" {
			if metadata == nil {
				metadata = make(map[string]any)
			}
			if _, ok := metadata["org_id"]; !ok {
				metadata["org_id"] = session.OrgID
			}
		}
	} else if device := deviceauth.DeviceFromContext(ctx); device != nil {
		entry.ActorID = &device.ID
		entry.ActorType = "device"
		if metadata == nil {
			metadata = make(map[string]any)
		}
		if _, ok := metadata["org_id"]; !ok {
			metadata["org_id"] = device.OrgID
		}
	} else {
		entry.ActorType = "system"
	}

	if targetType != "" {
		entry.TargetType = &targetType
	}
	if targetID != "" {
		entry.TargetID = &targetID
	}

	if len(metadata) > 0 {
		b, err := json.Marshal(metadata)
		if err == nil {
			entry.Metadata = b
		}
	}

	ip := realIP(r)
	entry.IPAddress = &ip

	repo := repository.NewAuditRepo(h.pool)
	_ = repo.Log(ctx, entry)
}
```

**Add imports** to the import block at top of `audit_handler.go`:

```go
import (
	"context"          // DELETE THIS LINE - no longer needed directly
	"encoding/json"
	"net"              // ADD
	"net/http"
	"strconv"
	"strings"          // ADD

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/deviceauth"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)
```

Note: remove `"context"` from imports since we now use `r.Context()` internally.

### Step 4: Run tests to confirm they pass

```bash
cd routeguard-api
go test -v -run TestRealIP ./internal/api/
go build ./...
```

Expected: 3 tests pass, build succeeds.

### Step 5: Commit

```bash
cd routeguard-api
git add internal/api/audit_handler.go internal/api/audit_handler_test.go
git commit -m "fix: capture IP address in LogAudit, accept *http.Request"
```

---

## Task 2: Fix admin ListAuditLogs - make org_id optional

**Files:**
- Modify: `routeguard-api/internal/repository/audit_repo.go`
- Modify: `routeguard-api/internal/api/audit_handler.go`

### Step 1: Add `ListAll` to AuditRepo

In `routeguard-api/internal/repository/audit_repo.go`, add this method after `List`:

```go
// ListAll returns all audit logs with pagination, regardless of org.
// Results are ordered newest-first.
func (r *AuditRepo) ListAll(ctx context.Context, limit, offset int) ([]domain.AuditLog, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, actor_type, action,
		       target_type, target_id, metadata, ip_address, created_at
		FROM audit_logs
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("audit list all: %w", err)
	}
	defer rows.Close()

	logs := make([]domain.AuditLog, 0)
	for rows.Next() {
		var l domain.AuditLog
		if err := rows.Scan(
			&l.ID, &l.ActorID, &l.ActorType, &l.Action,
			&l.TargetType, &l.TargetID, &l.Metadata, &l.IPAddress, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}
```

### Step 2: Fix `ListAuditLogs` handler

In `audit_handler.go`, replace `ListAuditLogs` entirely:

```go
// ListAuditLogs handles GET /admin/audit-logs?org_id=...&limit=...&offset=...
// org_id is optional; omitting it returns all logs across all orgs.
func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	limit := parseIntParam(r, "limit", 50)
	offset := parseIntParam(r, "offset", 0)

	repo := repository.NewAuditRepo(h.pool)
	var logs []domain.AuditLog
	var err error
	if orgID == "" {
		logs, err = repo.ListAll(r.Context(), limit, offset)
	} else {
		logs, err = repo.List(r.Context(), orgID, limit, offset)
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, logs)
}
```

### Step 3: Build to verify

```bash
cd routeguard-api
go build ./...
go test -v ./internal/api/ ./internal/repository/
```

Expected: builds clean, no test regressions.

### Step 4: Commit

```bash
git add internal/api/audit_handler.go internal/repository/audit_repo.go
git commit -m "fix: make org_id optional in admin audit log list endpoint"
```

---

## Task 3: Wire LogAudit into admin org handlers

**Files:**
- Modify: `routeguard-api/internal/api/org_handler.go`

### Step 1: Add LogAudit calls

In `org_handler.go`, after each successful write operation, add a `LogAudit` call. The admin (staff) session has no OrgID, so pass `org_id` explicitly in metadata so the log is filterable by org.

**CreateOrg** - after `JSON(w, http.StatusCreated, org)`:
```go
h.LogAudit(r, "org.created", "organization", org.ID, map[string]any{"org_id": org.ID})
```

**UpdateOrg** - after `JSON(w, http.StatusOK, org)`:
```go
h.LogAudit(r, "org.updated", "organization", id, map[string]any{"org_id": id})
```

**DeleteOrg** - after `NoContent(w)`:
```go
h.LogAudit(r, "org.deleted", "organization", id, map[string]any{"org_id": id})
```

### Step 2: Build

```bash
cd routeguard-api
go build ./...
```

Expected: clean build.

### Step 3: Commit

```bash
git add internal/api/org_handler.go
git commit -m "feat: audit log org create/update/delete"
```

---

## Task 4: Wire LogAudit into admin device handlers

**Files:**
- Modify: `routeguard-api/internal/api/admin_device_handler.go`

### Step 1: Add LogAudit calls

**CreateAdminDevice** - after `JSON(w, http.StatusCreated, ...)`:
```go
h.LogAudit(r, "device.provisioned", "device", device.ID, map[string]any{"org_id": req.OrgID})
```

**UpdateAdminDevice** - after `JSON(w, http.StatusOK, device)`:
```go
h.LogAudit(r, "device.updated", "device", id, map[string]any{"org_id": device.OrgID})
```

**DeleteAdminDevice** - after `NoContent(w)`:
```go
h.LogAudit(r, "device.revoked", "device", id, nil)
```
Note: DeleteAdminDevice (Revoke) does not return the device, so org_id is not available without an extra query. Omit it - the event still appears in the all-orgs admin list view.

### Step 2: Build

```bash
cd routeguard-api
go build ./...
```

### Step 3: Commit

```bash
git add internal/api/admin_device_handler.go
git commit -m "feat: audit log device provisioned/updated/revoked"
```

---

## Task 5: Wire LogAudit into SSO handlers

**Files:**
- Modify: `routeguard-api/internal/api/sso_crud_handler.go`

### Step 1: Add LogAudit to admin SSO handlers

**CreateOrgSSO** - after `JSON(w, http.StatusCreated, toSSOResponse(conn))`:
```go
h.LogAudit(r, "sso.created", "sso_connection", conn.ID, map[string]any{"org_id": orgID})
```

**UpdateOrgSSO** - after `JSON(w, http.StatusOK, toSSOResponse(conn))`:
```go
h.LogAudit(r, "sso.updated", "sso_connection", connectionID, nil)
```

**DeleteOrgSSO** - after `NoContent(w)`:
```go
h.LogAudit(r, "sso.deleted", "sso_connection", connectionID, nil)
```

### Step 2: Add LogAudit to dashboard SSO handlers

**CreateMySSO** - after `JSON(w, http.StatusCreated, toSSOResponse(conn))`:
```go
h.LogAudit(r, "sso.created", "sso_connection", conn.ID, nil)
```
(session.OrgID is non-empty here, so org_id is automatically included in metadata by `LogAudit`)

**UpdateMySSO** - after `JSON(w, http.StatusOK, toSSOResponse(conn))`:
```go
h.LogAudit(r, "sso.updated", "sso_connection", connectionID, nil)
```

**DeleteMySSO** - after `NoContent(w)` (inside the success path):
```go
h.LogAudit(r, "sso.deleted", "sso_connection", connectionID, nil)
```

### Step 3: Build

```bash
cd routeguard-api
go build ./...
```

### Step 4: Commit

```bash
git add internal/api/sso_crud_handler.go
git commit -m "feat: audit log SSO connection create/update/delete"
```

---

## Task 6: Wire LogAudit into auth handlers

**Files:**
- Modify: `routeguard-api/internal/api/auth_handler.go`

### Step 1: Add LogAudit to Logout

The session IS in context at logout time (middleware ran). Add after `NoContent(w)`:

```go
h.LogAudit(r, "auth.logout", "", "", nil)
```

### Step 2: Add direct audit log for Login

Login is special: at the time we want to log, the session has just been created but is not yet in the request context (no middleware has injected it). Use `repo.Log` directly instead of `LogAudit`.

Add a helper method call after `JSON(w, http.StatusOK, ...)` in the Login success path:

```go
h.logLoginEvent(r, user.ID, orgID)
```

Add this private method to `auth_handler.go`:

```go
// logLoginEvent records a successful login. Called directly because the new
// session is not yet in the request context at the time Login runs.
func (h *Handler) logLoginEvent(r *http.Request, userID, orgID string) {
	ip := realIP(r)
	meta := map[string]any{}
	if orgID != "" {
		meta["org_id"] = orgID
	}
	b, _ := json.Marshal(meta)
	entry := domain.AuditLog{
		ActorID:   &userID,
		ActorType: "user",
		Action:    "auth.login",
		IPAddress: &ip,
		Metadata:  b,
	}
	repo := repository.NewAuditRepo(h.pool)
	_ = repo.Log(r.Context(), entry)
}
```

Add required imports to `auth_handler.go` if not already present:
- `"encoding/json"` (likely already there)
- `"github.com/routeguard/api/internal/domain"`
- `"github.com/routeguard/api/internal/repository"`

### Step 3: Build and test

```bash
cd routeguard-api
go build ./...
go test -v ./...
```

Expected: clean build, all existing tests pass.

### Step 4: Commit

```bash
git add internal/api/auth_handler.go
git commit -m "feat: audit log auth login and logout events"
```

---

## Task 7: Verify end-to-end

### Step 1: Run full test suite

```bash
cd routeguard-api
go test -v ./...
```

Expected: all tests pass, zero failures.

### Step 2: Run lint / vet

```bash
cd routeguard-api
go vet ./...
```

Expected: no issues.

### Step 3: Verify the frontend audit log page builds

```bash
cd dashboard
npm run build
```

Expected: TypeScript clean, zero errors.

---

## Action Name Reference

| Action | Triggered by |
|--------|-------------|
| `auth.login` | Successful password login |
| `auth.logout` | Any logout |
| `org.created` | Admin creates org |
| `org.updated` | Admin updates org |
| `org.deleted` | Admin deletes org |
| `device.provisioned` | Admin provisions device |
| `device.updated` | Admin updates device |
| `device.revoked` | Admin revokes device |
| `sso.created` | Admin or org user creates SSO connection |
| `sso.updated` | Admin or org user updates SSO connection |
| `sso.deleted` | Admin or org user deletes SSO connection |
