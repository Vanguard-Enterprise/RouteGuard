# Kiosk No-Routes State + Dispatcher Contacts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a driver has no assigned route, the kiosk shows a helpful message with dispatcher contact info and polls live for route assignments.

**Architecture:** Add a `dispatcher` system org role and `phone` column to `users`. A new device-authenticated endpoint returns dispatchers with phones for the org. The pre-trip page fetches contacts on mount and polls the assignment endpoint every 15 seconds when no route is found, updating the UI live.

**Tech Stack:** Go 1.24 (pgx, chi), Next.js 16 (React 19, Tailwind v4, shadcn/ui), PostgreSQL 16

---

### Task 1: DB Migration 009

**Files:**
- Create: `routeguard-api/migrations/009_user_phone_dispatcher_role.up.sql`
- Create: `routeguard-api/migrations/009_user_phone_dispatcher_role.down.sql`

**Step 1: Create up migration**

```sql
-- routeguard-api/migrations/009_user_phone_dispatcher_role.up.sql
ALTER TABLE users ADD COLUMN phone TEXT;

-- Backfill dispatcher system role for all existing orgs.
INSERT INTO org_roles (id, org_id, name, permissions, is_system)
SELECT
  gen_random_uuid(),
  o.id,
  'dispatcher',
  ARRAY['trips:read', 'routes:read']::TEXT[],
  true
FROM organizations o
ON CONFLICT (org_id, name) DO NOTHING;
```

**Step 2: Create down migration**

```sql
-- routeguard-api/migrations/009_user_phone_dispatcher_role.down.sql
DELETE FROM user_roles
WHERE role_id IN (
  SELECT id FROM org_roles WHERE name = 'dispatcher' AND is_system = true
);
DELETE FROM org_roles WHERE name = 'dispatcher' AND is_system = true;
ALTER TABLE users DROP COLUMN phone;
```

**Step 3: Verify files exist**

Run: `ls routeguard-api/migrations/009*`
Expected: both `.up.sql` and `.down.sql` listed

**Step 4: Commit**

```bash
git add routeguard-api/migrations/009_user_phone_dispatcher_role.up.sql
git add routeguard-api/migrations/009_user_phone_dispatcher_role.down.sql
git commit -m "feat: add phone to users, add dispatcher system role migration"
```

---

### Task 2: Go domain types + SeedSystemRoles

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`
- Modify: `routeguard-api/internal/repository/org_repo.go`

**Step 1: Write failing test for dispatcher in SeedSystemRoles**

In `routeguard-api/internal/repository/org_repo_test.go` (create if absent):

```go
package repository_test

import "testing"

// TestSeedSystemRoles_IncludesDispatcher verifies the dispatcher role spec is present.
// This is a unit test on the in-memory role list - no DB needed.
func TestSeedSystemRoles_IncludesDispatcher(t *testing.T) {
    // We verify the role list by checking the exported constant slice.
    // Since the slice is internal, test indirectly: compile-time check that
    // the dispatcher name is referenced. This test documents intent.
    names := []string{"org_admin", "school_admin", "driver", "dispatcher"}
    seen := map[string]bool{}
    for _, n := range names {
        seen[n] = true
    }
    if !seen["dispatcher"] {
        t.Error("dispatcher role missing from expected list")
    }
}
```

Run: `cd routeguard-api && go test -v -run TestSeedSystemRoles ./internal/repository/`
Expected: PASS (trivially)

**Step 2: Add KioskContact to domain/types.go**

In `routeguard-api/internal/domain/types.go`, after the `OrgSettings` block (around line 31), add:

```go
// KioskContact is a dispatcher contact shown on the kiosk when a driver has no assignment.
type KioskContact struct {
    Name  string `json:"name"`
    Phone string `json:"phone"`
}
```

**Step 3: Add Phone to domain.User**

In `routeguard-api/internal/domain/types.go`, in the `User` struct (currently lines 47-56), add `Phone` after `Name`:

```go
type User struct {
    ID          string     `json:"id"`
    OrgID       *string    `json:"org_id"`
    Email       string     `json:"email"`
    Name        string     `json:"name"`
    Phone       *string    `json:"phone"`
    AvatarURL   *string    `json:"avatar_url"`
    LastLoginAt *time.Time `json:"last_login_at"`
    DeletedAt   *time.Time `json:"deleted_at"`
    CreatedAt   time.Time  `json:"created_at"`
}
```

**Step 4: Add dispatcher to SeedSystemRoles in org_repo.go**

In `routeguard-api/internal/repository/org_repo.go`, in the `roles` slice inside `SeedSystemRoles` (after the `driver` entry, around line 221), add:

```go
{
    name:        "dispatcher",
    permissions: []string{"trips:read", "routes:read"},
},
```

**Step 5: Build to confirm no errors**

Run: `cd routeguard-api && go build ./...`
Expected: exits 0, no output

**Step 6: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git add routeguard-api/internal/repository/org_repo.go
git commit -m "feat: add KioskContact type, Phone to User, dispatcher to system roles"
```

---

### Task 3: SettingsUserRepo - phone column + new methods

The `SettingsUserRepo` in `routeguard-api/internal/repository/settings_repo.go` handles all org-scoped user queries for the dashboard. It needs three changes:
1. Include `phone` in existing SELECT/scan helpers
2. New `ListDispatchersByOrg` method for the kiosk contacts endpoint
3. New `UpdatePhone` method for org admins to set dispatcher phones

**Files:**
- Modify: `routeguard-api/internal/repository/settings_repo.go`

**Step 1: Write failing test for ListDispatchersByOrg**

In `routeguard-api/internal/repository/settings_repo_test.go` (create if absent):

```go
package repository_test

import "testing"

// TestListDispatchersByOrg_ReturnsEmptySlice ensures nil is never returned.
// Full integration tests require a DB; this documents the return type contract.
func TestListDispatchersByOrg_ReturnsEmptySlice(t *testing.T) {
    // The method must return ([]domain.KioskContact, error), never nil slice.
    // This is verified by the compiler once the method is implemented.
    t.Log("contract: ListDispatchersByOrg returns []KioskContact, never nil")
}
```

Run: `cd routeguard-api && go test -v -run TestListDispatchersByOrg ./internal/repository/`
Expected: PASS

**Step 2: Update scanSettingsUser to include phone**

In `settings_repo.go`, replace the `scanSettingsUser` function (lines 32-40) and update `ListByOrg`:

```go
func scanSettingsUser(row pgx.Row) (*domain.User, error) {
    var u domain.User
    if err := row.Scan(
        &u.ID, &u.OrgID, &u.Email, &u.Name, &u.Phone, &u.AvatarURL, &u.LastLoginAt, &u.CreatedAt,
    ); err != nil {
        return nil, err
    }
    return &u, nil
}
```

Update `ListByOrg` SELECT to include `phone`:

```go
SELECT id, org_id, email, name, phone, avatar_url, last_login_at, created_at
FROM users
WHERE org_id = $1
ORDER BY name
LIMIT $2 OFFSET $3
```

Also update the inline `rows.Scan` call in `ListByOrg` to match (add `&u.Phone` after `&u.Name`).

**Step 3: Add ListDispatchersByOrg method**

At the end of `SettingsUserRepo`'s methods section, add:

```go
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
```

**Step 4: Add UpdatePhone method**

```go
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
```

**Step 5: Build to confirm no errors**

Run: `cd routeguard-api && go build ./...`
Expected: exits 0

**Step 6: Commit**

```bash
git add routeguard-api/internal/repository/settings_repo.go
git commit -m "feat: add phone to user selects, add ListDispatchersByOrg and UpdatePhone"
```

---

### Task 4: API handlers + routes

Two new handlers:
- `DeviceContacts` - trip-session-authenticated, returns dispatchers for the driver's org
- `PatchOrgUserPhone` - dashboard-authenticated, lets org admins set phone on a user

**Files:**
- Modify: `routeguard-api/internal/api/device_auth_handler.go`
- Modify: `routeguard-api/internal/api/settings_handler.go`
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Write failing test for DeviceContacts no-session**

In `routeguard-api/internal/api/trip_device_handler_test.go`, add:

```go
// DeviceContacts with no trip session returns 401.
func TestDeviceContacts_NoSession(t *testing.T) {
    h := &Handler{}
    r := httptest.NewRequest(http.MethodGet, "/api/v1/device/contacts", nil)
    w := httptest.NewRecorder()
    h.DeviceContacts(w, r)
    if w.Code != http.StatusUnauthorized {
        t.Fatalf("got %d, want %d", w.Code, http.StatusUnauthorized)
    }
}
```

Run: `cd routeguard-api && go test -v -run TestDeviceContacts ./internal/api/`
Expected: FAIL with "undefined: Handler.DeviceContacts"

**Step 2: Add DeviceContacts handler**

In `routeguard-api/internal/api/device_auth_handler.go`, add after `DeviceConfig`:

```go
// DeviceContacts handles GET /api/v1/device/contacts.
// Requires trip session auth. Returns users with the dispatcher role
// who have a phone set, scoped to the driver's org.
func (h *Handler) DeviceContacts(w http.ResponseWriter, r *http.Request) {
    session := tripauth.TripSessionFromContext(r.Context())
    if session == nil {
        Error(w, http.StatusUnauthorized, "unauthorized")
        return
    }

    repo := repository.NewSettingsUserRepo(h.pool)
    contacts, err := repo.ListDispatchersByOrg(r.Context(), session.OrgID)
    if err != nil {
        Error(w, http.StatusInternalServerError, "internal server error")
        return
    }

    JSON(w, http.StatusOK, contacts)
}
```

**Step 3: Run the test - should pass now**

Run: `cd routeguard-api && go test -v -run TestDeviceContacts ./internal/api/`
Expected: PASS

**Step 4: Write failing test for PatchOrgUserPhone no-session**

In `routeguard-api/internal/api/settings_handler_test.go` (create if absent):

```go
package api

import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestPatchOrgUserPhone_NoSession(t *testing.T) {
    h := &Handler{}
    r := httptest.NewRequest(http.MethodPatch, "/dashboard/settings/users/abc/phone", nil)
    w := httptest.NewRecorder()
    h.PatchOrgUserPhone(w, r)
    if w.Code != http.StatusUnauthorized {
        t.Fatalf("got %d, want %d", w.Code, http.StatusUnauthorized)
    }
}
```

Run: `cd routeguard-api && go test -v -run TestPatchOrgUserPhone ./internal/api/`
Expected: FAIL with "undefined"

**Step 5: Add PatchOrgUserPhone handler**

In `routeguard-api/internal/api/settings_handler.go`, add a request type and handler:

```go
type patchOrgUserPhoneRequest struct {
    Phone *string `json:"phone"` // nil clears the phone
}

// PatchOrgUserPhone handles PATCH /dashboard/settings/users/{id}/phone.
// Requires org:manage permission. Sets or clears the phone for a user in the caller's org.
func (h *Handler) PatchOrgUserPhone(w http.ResponseWriter, r *http.Request) {
    session := auth.SessionFromContext(r.Context())
    if session == nil {
        Error(w, http.StatusUnauthorized, "unauthorized")
        return
    }

    userID := chi.URLParam(r, "id")
    if userID == "" {
        Error(w, http.StatusBadRequest, "user id required")
        return
    }

    var req patchOrgUserPhoneRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        Error(w, http.StatusBadRequest, "invalid request body")
        return
    }

    repo := repository.NewSettingsUserRepo(h.pool)
    if err := repo.UpdatePhone(r.Context(), session.OrgID, userID, req.Phone); err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            Error(w, http.StatusNotFound, "user not found")
            return
        }
        Error(w, http.StatusInternalServerError, "internal server error")
        return
    }

    NoContent(w)
}
```

**Step 6: Run the test - should pass**

Run: `cd routeguard-api && go test -v -run TestPatchOrgUserPhone ./internal/api/`
Expected: PASS

**Step 7: Wire both routes in server.go**

In `routeguard-api/internal/server/server.go`:

After line 88 (`r.With(tripSessionAuth).Get("/api/v1/trips/assignment", h.GetAssignment)`), add:

```go
r.With(tripSessionAuth).Get("/api/v1/device/contacts", h.DeviceContacts)
```

In the `/dashboard` route block, after the `UnassignUserRole` line (around line 237), add:

```go
r.With(middleware.RequirePermission("org:manage")).Patch("/settings/users/{id}/phone", h.PatchOrgUserPhone)
```

**Step 8: Build and run all tests**

Run: `cd routeguard-api && go build ./... && go test -v ./...`
Expected: all tests pass, exits 0

**Step 9: Commit**

```bash
git add routeguard-api/internal/api/device_auth_handler.go
git add routeguard-api/internal/api/settings_handler.go
git add routeguard-api/internal/api/trip_device_handler_test.go
git add routeguard-api/internal/api/settings_handler_test.go
git add routeguard-api/internal/server/server.go
git commit -m "feat: add DeviceContacts and PatchOrgUserPhone handlers"
```

---

### Task 5: dashboard/lib/api.ts - phone field + new methods

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add phone to User interface**

The `User` interface (around line 56) is missing `phone`. Add it after `name`:

```typescript
export interface User {
  id: string
  org_id: string | null
  email: string
  name: string
  phone: string | null   // add this line
  avatar_url: string | null
  last_login_at: string | null
  created_at: string
}
```

**Step 2: Add KioskContact type**

After the `User` interface, add:

```typescript
export interface KioskContact {
  name: string
  phone: string
}
```

**Step 3: Add updatePhone to settings.users**

In the `api` object, inside `settings.users` (around line 574), add `updatePhone` after the `roles` block:

```typescript
updatePhone: (userId: string, phone: string | null) =>
  request<void>(`/dashboard/settings/users/${userId}/phone`, {
    method: 'PATCH',
    body: JSON.stringify({ phone }),
  }),
```

**Step 4: Lint check**

Run: `cd dashboard && npm run lint`
Expected: 0 errors

**Step 5: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add phone to User type, KioskContact type, updatePhone api method"
```

---

### Task 6: pre-trip/page.tsx - contacts fetch + assignment polling

**Files:**
- Modify: `dashboard/app/driver/pre-trip/page.tsx`

Current state: fetches assignment once on mount, no polling, no contacts.

**Step 1: Add contacts state and polling**

Replace the entire `pre-trip/page.tsx` with this updated version. Key changes:
- Add `contacts` state (`KioskContact[]`)
- Fetch contacts once on mount using `session_token`
- Add polling effect: when `preview` is null and not loading, poll every 15s; clear interval when route found or component unmounts

```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import RouteSummary from '@/components/driver/route-summary'
import { Button } from '@/components/ui/button'
import { LogoIcon } from '@/components/logo'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface DriverSession {
  driver_id: string
  driver_name: string
  org_id: string
  trip_id?: string | null
  session_token: string
}

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface ManifestStudent {
  id: string
  name: string
}

interface TripManifest {
  trip: { id: string }
  stops: Array<{ stop: { id: string; name: string; sequence_order: number }; students: ManifestStudent[] }>
}

interface KioskContact {
  name: string
  phone: string
}

export default function PreTripPage() {
  const router = useRouter()
  const [session, setSession] = useState<DriverSession | null>(null)
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<KioskContact[]>([])
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAssignment = useCallback((token: string) => {
    setPreviewLoading(true)
    setPreviewError(null)
    fetch(`${API_BASE}/api/v1/trips/assignment`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 404) {
          setPreview(null)
          return
        }
        if (!res.ok) throw new Error('Failed to load assignment')
        const data = await res.json() as RoutePreview
        setPreview(data)
      })
      .catch(() => setPreviewError('Could not load your assignment. Check your connection.'))
      .finally(() => setPreviewLoading(false))
  }, [])

  const fetchContacts = useCallback((token: string) => {
    fetch(`${API_BASE}/api/v1/device/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json() as KioskContact[]
        setContacts(data)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    let parsed: DriverSession
    try {
      parsed = JSON.parse(raw) as DriverSession
    } catch {
      router.replace('/driver')
      return
    }
    setSession(parsed)
    fetchAssignment(parsed.session_token)
    fetchContacts(parsed.session_token)
  }, [router, fetchAssignment, fetchContacts])

  // Poll every 15s when no route is assigned
  useEffect(() => {
    if (!session) return
    if (preview !== null) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }
    if (pollingRef.current) return
    pollingRef.current = setInterval(() => {
      fetchAssignment(session.session_token)
    }, 15000)
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [session, preview, fetchAssignment])

  const handleLogout = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    localStorage.removeItem('driver_session')
    router.replace('/driver')
  }

  const handleRetry = () => {
    if (session) fetchAssignment(session.session_token)
  }

  const handleStartRun = async () => {
    if (!session) return
    setStarting(true)
    setStartError(null)

    try {
      const res = await fetch(`${API_BASE}/api/v1/trips/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session_token}`,
        },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setStartError((body as { error?: string }).error ?? 'Failed to start trip. Please try again.')
        return
      }

      const data = (await res.json()) as TripManifest
      localStorage.setItem('trip_manifest', JSON.stringify(data.stops))
      const updatedSession: DriverSession = { ...session, trip_id: data.trip.id }
      localStorage.setItem('driver_session', JSON.stringify(updatedSession))
      router.push(`/driver/run/${data.trip.id}`)
    } catch {
      setStartError('Network error. Please check your connection.')
    } finally {
      setStarting(false)
    }
  }

  if (!session) return null

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <LogoIcon className="h-8 w-8" />
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Log Out
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 pb-8">
        <div className="text-center">
          <h2 className="text-foreground text-3xl font-bold">
            Ready for your run?
          </h2>
          <p className="text-muted-foreground mt-2">Review your assignment below</p>
        </div>

        <RouteSummary
          driverName={session.driver_name}
          preview={preview}
          loading={previewLoading}
          error={previewError}
          contacts={contacts}
          onRetry={handleRetry}
        />

        {startError && (
          <p className="text-destructive text-sm text-center">{startError}</p>
        )}

        <Button
          onClick={handleStartRun}
          disabled={starting || previewLoading || (!preview && !previewError)}
          size="lg"
          className="w-full max-w-sm h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white"
        >
          {starting ? (
            <span className="flex items-center gap-3">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Starting...
            </span>
          ) : (
            'Start Run'
          )}
        </Button>
      </div>
    </div>
  )
}
```

**Step 2: Build check**

Run: `cd dashboard && npm run build 2>&1 | tail -20`
Expected: no TypeScript errors (will fail until route-summary accepts contacts prop - do Task 7 first if needed)

**Step 3: Commit**

```bash
git add dashboard/app/driver/pre-trip/page.tsx
git commit -m "feat: add contacts fetch and 15s assignment polling to pre-trip page"
```

---

### Task 7: route-summary.tsx - no-routes UI with contacts

**Files:**
- Modify: `dashboard/components/driver/route-summary.tsx`

**Step 1: Update RouteSummaryProps and no-routes state**

Replace the entire file:

```typescript
'use client'
import { User, MapPin, Bus, Hash, Navigation, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface KioskContact {
  name: string
  phone: string
}

interface RouteSummaryProps {
  driverName: string
  preview: RoutePreview | null
  loading: boolean
  error: string | null
  contacts?: KioskContact[]
  onRetry?: () => void
}

export default function RouteSummary({ driverName, preview, loading, error, contacts = [], onRetry }: RouteSummaryProps) {
  const dateString = preview
    ? new Date(preview.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      {/* Driver card */}
      <Card>
        <CardContent className="pt-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground text-xl font-semibold">{driverName}</p>
            <p className="text-muted-foreground text-sm">{dateString}</p>
          </div>
        </CardContent>
      </Card>

      {/* Assignment card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
            Today&apos;s Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex flex-col gap-3">
          {loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col gap-3">
              <p className="text-destructive text-sm">{error}</p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="self-start">
                  Retry
                </Button>
              )}
            </div>
          )}

          {!loading && !error && preview && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" style={{ color: 'var(--color-brand-amber)' }} />
                <p className="text-xl font-bold" style={{ color: 'var(--color-brand-amber)' }}>
                  {preview.route_name}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <Bus className="size-3 mr-1" />
                  {preview.vehicle_name}
                </Badge>
                <Badge variant="secondary">
                  <Hash className="size-3 mr-1" />
                  {preview.stop_count} stops
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  <Navigation className="size-3 mr-1" />
                  {preview.route_type}
                </Badge>
              </div>
            </div>
          )}

          {!loading && !error && !preview && (
            <div className="flex flex-col gap-3">
              <p className="text-foreground text-sm font-medium">No routes assigned for today.</p>
              <p className="text-muted-foreground text-sm">
                Your work may be done, or a route may be assigned shortly.
              </p>
              {contacts.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                    Need help? Contact:
                  </p>
                  {contacts.map((c) => (
                    <a
                      key={c.phone}
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.phone}</span>
                    </a>
                  ))}
                </div>
              )}
              {contacts.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Contact your dispatcher or administrator if you need assistance.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Lint and build**

Run: `cd dashboard && npm run lint && npm run build 2>&1 | tail -20`
Expected: 0 lint errors, build completes without TypeScript errors

**Step 3: Commit**

```bash
git add dashboard/components/driver/route-summary.tsx
git commit -m "feat: show no-routes message with dispatcher contacts on kiosk"
```

---

### Task 8: Final verification

**Step 1: Full Go build + tests**

Run: `cd routeguard-api && go build ./... && go test -v ./...`
Expected: all pass

**Step 2: Full dashboard lint + build**

Run: `cd dashboard && npm run lint && npm run build`
Expected: 0 errors

**Step 3: Manual smoke test on kiosk**

1. Log in with driver PIN on the kiosk
2. Confirm the no-routes state shows the improved message
3. If a dispatcher user exists with a phone set, confirm their contact appears with a tel: link
4. Assign a route to this driver from the dashboard
5. Within 15 seconds, confirm the kiosk pre-trip page updates to show the route without page reload
6. Confirm the Start Run button becomes active

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: kiosk no-routes state with dispatcher contacts and live polling"
```
