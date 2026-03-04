# Dashboard Org View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken org-user dashboard by correcting the API field-name mismatch, completing RBAC permissions, backfilling existing orgs, and migrating the dashboard layout to the shadcn SidebarProvider pattern used by /admin.

**Architecture:** Three layers of change - Go API (field names + permissions + migration), then new dashboard sidebar components, then wire the layout. Old `AppSidebar` and `DashboardHeader` are deleted at the end.

**Tech Stack:** Go 1.24 (chi, pgx), Next.js 16 App Router, shadcn/ui sidebar, Sonner toasts, SSE via `useTripStream` hook.

---

### Task 1: Fix `/auth/me` response field names

The `Me()` handler currently returns `user_id` and `roles`. The TypeScript `User` interface expects `id` and `permissions`. This mismatch causes `user.permissions` to be `undefined` at runtime, breaking the nav sidebar for all org users.

**Files:**
- Create: `routeguard-api/internal/api/auth_handler_test.go`
- Modify: `routeguard-api/internal/api/auth_handler.go:153-166`

**Step 1: Write the failing test**

Create `routeguard-api/internal/api/auth_handler_test.go`:

```go
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/routeguard/api/internal/auth"
)

func TestMe_ResponseContainsIdAndPermissions(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	ctx := context.WithValue(r.Context(), auth.SessionContextKey, &auth.SessionPayload{
		UserID:  "user-123",
		OrgID:   "org-456",
		Email:   "test@example.com",
		Name:    "Test User",
		IsStaff: false,
		Roles:   []string{"routes:read", "students:read"},
	})
	r = r.WithContext(ctx)
	w := httptest.NewRecorder()

	h.Me(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["id"] != "user-123" {
		t.Errorf("want id=user-123, got %v", body["id"])
	}
	if _, ok := body["permissions"]; !ok {
		t.Error("response missing 'permissions' field")
	}
	if _, ok := body["user_id"]; ok {
		t.Error("response must not contain legacy 'user_id' field")
	}
	if _, ok := body["roles"]; ok {
		t.Error("response must not contain legacy 'roles' field")
	}
}
```

**Step 2: Run the test to verify it fails**

```bash
cd routeguard-api
go test -v -run TestMe_ResponseContainsIdAndPermissions ./internal/api/
```

Expected: FAIL - body will contain `user_id` and `roles` keys, not `id` and `permissions`.

**Step 3: Fix the Me() handler**

In `routeguard-api/internal/api/auth_handler.go`, find the `Me()` function (around line 153) and replace the JSON map:

```go
// Me handles GET /auth/me — returns the current session user.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	JSON(w, http.StatusOK, map[string]any{
		"id":          session.UserID,
		"email":       session.Email,
		"name":        session.Name,
		"is_staff":    session.IsStaff,
		"org_id":      session.OrgID,
		"permissions": session.Roles,
	})
}
```

**Step 4: Run the test to verify it passes**

```bash
go test -v -run TestMe_ResponseContainsIdAndPermissions ./internal/api/
```

Expected: PASS

**Step 5: Run all API tests**

```bash
go test -v ./...
```

Expected: all PASS

**Step 6: Commit**

```bash
git add internal/api/auth_handler.go internal/api/auth_handler_test.go
git commit -m "fix: return id and permissions fields from /auth/me"
```

---

### Task 2: Add missing permissions to org_admin role

The `org_admin` system role is missing `devices:read` and `devices:write`. This would keep the Devices nav item hidden even after Task 1 is fixed.

**Files:**
- Modify: `routeguard-api/internal/repository/org_repo.go:196-222`

**Step 1: Update the org_admin role spec in SeedSystemRoles**

Find the `roles` slice in `SeedSystemRoles()` and replace the `org_admin` entry:

```go
roles := []roleSpec{
    {
        name: "org_admin",
        permissions: []string{
            "org:manage", "users:read", "users:write",
            "schools:read", "schools:write",
            "students:read", "students:write",
            "drivers:read", "drivers:write",
            "vehicles:read", "vehicles:write",
            "routes:read", "routes:write",
            "trips:read", "reports:read",
            "devices:read", "devices:write",
        },
    },
    {
        name: "school_admin",
        permissions: []string{
            "schools:read",
            "students:read", "students:write",
            "guardians:read", "guardians:write",
            "routes:read", "trips:read",
        },
    },
    {
        name:        "driver",
        permissions: []string{"trips:read"},
    },
}
```

**Step 2: Run tests**

```bash
go test -v ./...
```

Expected: all PASS (no tests directly cover SeedSystemRoles, but nothing should break)

**Step 3: Commit**

```bash
git add internal/repository/org_repo.go
git commit -m "fix: add devices:read and devices:write to org_admin role"
```

---

### Task 3: Backfill system roles for existing orgs

Orgs created before `SeedSystemRoles` was wired into `CreateOrg` have no system roles. `CreateWithPasswordAndAdminRole` will fail for them. This migration is idempotent and safe to run multiple times.

**Files:**
- Create: `routeguard-api/migrations/007_backfill_org_system_roles.up.sql`
- Create: `routeguard-api/migrations/007_backfill_org_system_roles.down.sql`

**Step 1: Write the up migration**

Create `routeguard-api/migrations/007_backfill_org_system_roles.up.sql`:

```sql
-- Seed system roles for all organizations that are missing them.
-- Uses ON CONFLICT DO NOTHING so it is safe to run multiple times.
-- Permissions match SeedSystemRoles() in internal/repository/org_repo.go.

INSERT INTO org_roles (id, org_id, name, permissions, is_system)
SELECT
  gen_random_uuid(),
  o.id,
  r.name,
  r.permissions,
  true
FROM organizations o
CROSS JOIN (VALUES
  (
    'org_admin',
    ARRAY[
      'org:manage','users:read','users:write',
      'schools:read','schools:write',
      'students:read','students:write',
      'drivers:read','drivers:write',
      'vehicles:read','vehicles:write',
      'routes:read','routes:write',
      'trips:read','reports:read',
      'devices:read','devices:write'
    ]::TEXT[]
  ),
  (
    'school_admin',
    ARRAY[
      'schools:read',
      'students:read','students:write',
      'guardians:read','guardians:write',
      'routes:read','trips:read'
    ]::TEXT[]
  ),
  (
    'driver',
    ARRAY['trips:read']::TEXT[]
  )
) AS r(name, permissions)
ON CONFLICT (org_id, name) DO NOTHING;
```

**Step 2: Write the down migration**

Down migrations that delete shared RBAC data are destructive (users assigned to these roles would lose access). The safe choice is a no-op.

Create `routeguard-api/migrations/007_backfill_org_system_roles.down.sql`:

```sql
-- No-op: removing seeded system roles is destructive (users may be assigned to them).
-- To clean up, manually identify and remove the seeded rows after verifying no users depend on them.
SELECT 1;
```

**Step 3: Verify migration format is consistent with existing files**

```bash
ls routeguard-api/migrations/
```

Confirm `007_backfill_org_system_roles.up.sql` and `007_backfill_org_system_roles.down.sql` follow the same naming convention as existing pairs (006_, 005_, etc.).

**Step 4: Commit**

```bash
git add migrations/007_backfill_org_system_roles.up.sql migrations/007_backfill_org_system_roles.down.sql
git commit -m "fix: backfill system roles for orgs created before seeding was wired in"
```

---

### Task 4: Create DashboardBreadcrumb component

Mirrors `AdminBreadcrumb` but strips `/dashboard` prefix and uses dashboard-specific segment labels.

**Files:**
- Create: `dashboard/components/dashboard/dashboard-breadcrumb.tsx`

**Step 1: Create the file**

```tsx
'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const SEGMENT_LABELS: Record<string, string> = {
  routes: 'Routes',
  trips: 'Trips',
  students: 'Students',
  drivers: 'Drivers',
  vehicles: 'Vehicles',
  devices: 'Devices',
  schools: 'Schools',
  reports: 'Reports',
  settings: 'Settings',
  users: 'Users',
  roles: 'Roles',
  'api-keys': 'API Keys',
  sso: 'SSO',
  new: 'New',
  edit: 'Edit',
  attendance: 'Attendance',
  ridership: 'Ridership',
  performance: 'Performance',
  claim: 'Claim',
  provision: 'Provision',
  import: 'Import',
}

function isUuid(segment: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
}

export function DashboardBreadcrumb() {
  const pathname = usePathname()

  const segments = pathname
    .replace(/^\/dashboard\/?/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return null
  }

  const crumbs: { label: string; href: string }[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = isUuid(seg) ? 'Detail' : (SEGMENT_LABELS[seg] ?? seg)
    const href = '/dashboard/' + segments.slice(0, i + 1).join('/')
    crumbs.push({ label, href })
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map(({ label, href }, i) => (
          <React.Fragment key={href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={href}>{label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
```

**Step 2: Lint check**

```bash
cd dashboard
npm run lint
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add components/dashboard/dashboard-breadcrumb.tsx
git commit -m "feat: add DashboardBreadcrumb component"
```

---

### Task 5: Create DashboardNavUser component

Mirrors `AdminNavUser`. Key differences: logout redirects to `/` (not `/staff/login`), no profile link.

**Files:**
- Create: `dashboard/components/dashboard/dashboard-nav-user.tsx`

**Step 1: Create the file**

```tsx
'use client'

import { LogOut, MoreVertical } from 'lucide-react'

import { api, type User } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

interface DashboardNavUserProps {
  user: User
}

export function DashboardNavUser({ user }: DashboardNavUserProps) {
  const { isMobile } = useSidebar()

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user.email[0].toUpperCase()

  async function handleLogout() {
    try {
      await api.auth.logout()
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar_url ?? undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <MoreVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar_url ?? undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

**Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add components/dashboard/dashboard-nav-user.tsx
git commit -m "feat: add DashboardNavUser component"
```

---

### Task 6: Create DashboardNavMain component

Mirrors `AdminNavMain`. Filters nav items by `user.permissions` using optional chaining for safety. Uses `org:manage` (not `settings:read`) for Settings - this matches what the API actually enforces.

**Files:**
- Create: `dashboard/components/dashboard/dashboard-nav-main.tsx`

**Step 1: Create the file**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Route,
  Bus,
  GraduationCap,
  UserCheck,
  Truck,
  Tablet,
  School,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import { type User } from '@/lib/api'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  permission: string | null
}

const navItems: NavItem[] = [
  { title: 'Overview',  url: '/dashboard',          icon: LayoutDashboard, permission: null },
  { title: 'Routes',    url: '/dashboard/routes',    icon: Route,           permission: 'routes:read' },
  { title: 'Trips',     url: '/dashboard/trips',     icon: Bus,             permission: 'trips:read' },
  { title: 'Students',  url: '/dashboard/students',  icon: GraduationCap,   permission: 'students:read' },
  { title: 'Drivers',   url: '/dashboard/drivers',   icon: UserCheck,       permission: 'drivers:read' },
  { title: 'Vehicles',  url: '/dashboard/vehicles',  icon: Truck,           permission: 'vehicles:read' },
  { title: 'Devices',   url: '/dashboard/devices',   icon: Tablet,          permission: 'devices:read' },
  { title: 'Schools',   url: '/dashboard/schools',   icon: School,          permission: 'schools:read' },
  { title: 'Reports',   url: '/dashboard/reports',   icon: BarChart3,       permission: 'reports:read' },
  { title: 'Settings',  url: '/dashboard/settings',  icon: Settings,        permission: 'org:manage' },
]

interface Props {
  user: User
}

export function DashboardNavMain({ user }: Props) {
  const pathname = usePathname()

  const visible = navItems.filter(
    (item) => item.permission === null || (user.permissions?.includes(item.permission) ?? false),
  )

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => {
            const isActive =
              item.url === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === item.url || pathname.startsWith(item.url + '/')
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
```

**Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add components/dashboard/dashboard-nav-main.tsx
git commit -m "feat: add DashboardNavMain component"
```

---

### Task 7: Create DashboardAppSidebar component

Top-level sidebar shell. Mirrors `AdminAppSidebar`. Header links to `/dashboard`.

**Files:**
- Create: `dashboard/components/dashboard/dashboard-app-sidebar.tsx`

**Step 1: Create the file**

```tsx
import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { type User } from '@/lib/api'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { DashboardNavMain } from '@/components/dashboard/dashboard-nav-main'
import { DashboardNavUser } from '@/components/dashboard/dashboard-nav-user'

interface DashboardAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: User
}

export function DashboardAppSidebar({ user, ...props }: DashboardAppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/dashboard">
                <Image src="/logo.png" alt="RouteGuard" width={28} height={28} className="shrink-0" />
                <span className="text-base font-semibold">RouteGuard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <DashboardNavMain user={user} />
      </SidebarContent>
      <SidebarFooter>
        <DashboardNavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
```

**Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add components/dashboard/dashboard-app-sidebar.tsx
git commit -m "feat: add DashboardAppSidebar component"
```

---

### Task 8: Create DashboardSiteHeader component

Header bar with SidebarTrigger + breadcrumb on the left, and the SSE alert bell on the right. The alert bell logic is moved verbatim from the old `DashboardHeader`. Accepts `orgId` for the SSE hook.

**Files:**
- Create: `dashboard/components/dashboard/dashboard-site-header.tsx`

**Step 1: Create the file**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { DashboardBreadcrumb } from '@/components/dashboard/dashboard-breadcrumb'
import AlertPanel from '@/components/dashboard/alert-panel'
import { useTripStream } from '@/hooks/use-trip-stream'
import type { AlertEvent } from '@/hooks/use-trip-stream'

interface DashboardSiteHeaderProps {
  orgId: string
}

export function DashboardSiteHeader({ orgId }: DashboardSiteHeaderProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [localAlerts, setLocalAlerts] = useState<AlertEvent[]>([])
  const { alerts: streamAlerts } = useTripStream(orgId)
  const lastSeenTimestampRef = useRef<string | null>(null)
  const dismissedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (streamAlerts.length === 0) return
    const newest = streamAlerts[0]
    if (newest.timestamp === lastSeenTimestampRef.current) return
    const lastIdx = lastSeenTimestampRef.current
      ? streamAlerts.findIndex((a) => a.timestamp === lastSeenTimestampRef.current)
      : streamAlerts.length
    const newOnes = lastIdx === -1 ? [newest] : streamAlerts.slice(0, lastIdx)
    newOnes.forEach((alert) => {
      if (alert.type === 'route_deviation') {
        toast.warning(alert.message)
      } else {
        toast.error(alert.message)
      }
    })
    lastSeenTimestampRef.current = newest.timestamp
    setLocalAlerts(
      streamAlerts.filter((a) => !dismissedRef.current.has(`${a.type}-${a.timestamp}-${a.trip_id}`)),
    )
  }, [streamAlerts])

  function handleDismiss(idx: number) {
    const dismissed = localAlerts[idx]
    if (dismissed) {
      dismissedRef.current.add(`${dismissed.type}-${dismissed.timestamp}-${dismissed.trip_id}`)
    }
    setLocalAlerts((prev) => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    if (!panelOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen])

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      <DashboardBreadcrumb />
      <div className="ml-auto relative">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="relative p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
          aria-label="Alerts"
          aria-expanded={panelOpen}
          aria-haspopup="dialog"
        >
          <Bell size={18} />
          {localAlerts.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold flex items-center justify-center leading-none">
              {localAlerts.length > 99 ? '99+' : localAlerts.length}
            </span>
          )}
        </button>
        {panelOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPanelOpen(false)} />
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-lg border border-gray-100 z-20 overflow-hidden">
              <AlertPanel alerts={localAlerts} onDismiss={handleDismiss} />
            </div>
          </>
        )}
      </div>
    </header>
  )
}
```

**Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add components/dashboard/dashboard-site-header.tsx
git commit -m "feat: add DashboardSiteHeader with alert bell"
```

---

### Task 9: Wire the new layout, delete old components, verify build

Replace the layout, then delete the two old components that are no longer referenced.

**Files:**
- Modify: `dashboard/app/dashboard/layout.tsx`
- Delete: `dashboard/components/dashboard/app-sidebar.tsx`
- Delete: `dashboard/components/dashboard/header.tsx`

**Step 1: Replace layout.tsx**

Overwrite `dashboard/app/dashboard/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/server-api'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { DashboardAppSidebar } from '@/components/dashboard/dashboard-app-sidebar'
import { DashboardSiteHeader } from '@/components/dashboard/dashboard-site-header'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) {
    redirect('/staff/login')
  }

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': 'calc(var(--spacing) * 64)',
        '--header-height': 'calc(var(--spacing) * 14)',
      } as React.CSSProperties}
    >
      <DashboardAppSidebar user={user} variant="inset" />
      <SidebarInset>
        <DashboardSiteHeader orgId={user.org_id ?? ''} />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Verify nothing else imports the old components**

```bash
grep -r "app-sidebar\|DashboardHeader\|from.*dashboard/header" dashboard/app dashboard/components --include="*.tsx" --include="*.ts" -l
```

Expected: no results (only the two files you're about to delete should match, but they're not being imported anymore).

If any unexpected files appear, update their imports to the new components before proceeding.

**Step 3: Delete old components**

```bash
rm dashboard/components/dashboard/app-sidebar.tsx
rm dashboard/components/dashboard/header.tsx
```

**Step 4: Lint**

```bash
cd dashboard
npm run lint
```

Expected: 0 errors

**Step 5: Build**

```bash
npm run build
```

Expected: exits 0 with no TypeScript errors

**Step 6: Commit**

```bash
git add app/dashboard/layout.tsx
git rm components/dashboard/app-sidebar.tsx components/dashboard/header.tsx
git commit -m "feat: migrate dashboard layout to shadcn SidebarProvider pattern"
```

---

## Deployment notes

After merging, run the migration on the server:

```bash
# From the deploy/ directory on the server or via the deploy script
docker compose exec routeguard-api ./api migrate up
```

Or if migrations run automatically on deploy, just deploy normally. The backfill migration (007) is idempotent so running it on a DB that already has roles is safe.
