# Dashboard Org View Design

Date: 2026-03-04

## Context

The `/dashboard` area serves org users (school districts, transport companies). Several issues were identified:

1. The dashboard layout uses a custom `AppSidebar` + `DashboardHeader` while `/admin` uses the shadcn `SidebarProvider` pattern. These need to match.
2. `/auth/me` returns `user_id` and `roles` but the TypeScript `User` type expects `id` and `permissions`. This causes `user.permissions` to be `undefined` at runtime, breaking the sidebar permission filter - org users see only the Overview nav item.
3. The `org_admin` system role is missing `devices:read` and `devices:write`, so Devices would never appear in the sidebar even after the API fix.
4. The sidebar checks `settings:read` for Settings visibility, but the API enforces `org:manage`. This inconsistency means Settings is invisible to all org users.
5. Orgs created before `SeedSystemRoles` was wired into `CreateOrg` have no system roles - `CreateWithPasswordAndAdminRole` fails for them.

Separate role tables (`org_roles`/`user_roles` vs `staff_roles`/`staff_user_roles`), system role seeding, and auto-assignment of `org_admin` to staff-created users are already implemented correctly.

## Changes

### 1. Go API - `routeguard-api/`

#### 1a. Fix `/auth/me` response fields

`internal/api/auth_handler.go` - `Me()` handler

Change response keys from `user_id` -> `id` and `roles` -> `permissions` to match the TypeScript `User` interface.

```go
JSON(w, http.StatusOK, map[string]any{
    "id":          session.UserID,
    "email":       session.Email,
    "name":        session.Name,
    "is_staff":    session.IsStaff,
    "org_id":      session.OrgID,
    "permissions": session.Roles,
})
```

#### 1b. Add missing permissions to `org_admin`

`internal/repository/org_repo.go` - `SeedSystemRoles()`

Add `devices:read` and `devices:write` to the `org_admin` role's permissions slice.

Full `org_admin` permissions after fix:
```
org:manage, users:read, users:write,
schools:read, schools:write,
students:read, students:write,
drivers:read, drivers:write,
vehicles:read, vehicles:write,
routes:read, routes:write,
trips:read, reports:read,
devices:read, devices:write
```

#### 1c. Backfill migration

`migrations/007_backfill_org_system_roles.up.sql`

Idempotent SQL seeding the 3 system roles for all orgs missing them, using `ON CONFLICT (org_id, name) DO NOTHING`.

```sql
INSERT INTO org_roles (id, org_id, name, permissions, is_system)
SELECT
  gen_random_uuid(),
  o.id,
  r.name,
  r.permissions,
  true
FROM organizations o
CROSS JOIN (VALUES
  ('org_admin',    ARRAY['org:manage','users:read','users:write','schools:read','schools:write','students:read','students:write','drivers:read','drivers:write','vehicles:read','vehicles:write','routes:read','routes:write','trips:read','reports:read','devices:read','devices:write']),
  ('school_admin', ARRAY['schools:read','students:read','students:write','guardians:read','guardians:write','routes:read','trips:read']),
  ('driver',       ARRAY['trips:read'])
) AS r(name, permissions)
ON CONFLICT (org_id, name) DO NOTHING;
```

Down migration drops any `is_system = true` org_roles with those names that were created after the existing ones (not needed in practice; just a no-op down is acceptable).

### 2. Dashboard Frontend - `dashboard/`

#### 2a. New sidebar components

Mirror the admin component structure under `components/dashboard/`:

**`dashboard-app-sidebar.tsx`**
- Accepts `user: User` + spreads remaining `Sidebar` props
- `SidebarHeader`: RouteGuard logo linking to `/dashboard`
- `SidebarContent`: `<DashboardNavMain user={user} />`
- `SidebarFooter`: `<DashboardNavUser user={user} />`

**`dashboard-nav-main.tsx`** (client component)
- Uses `usePathname()` for active state
- Nav items with their required permissions:

| Label | Href | Permission |
|---|---|---|
| Overview | `/dashboard` | none |
| Routes | `/dashboard/routes` | `routes:read` |
| Trips | `/dashboard/trips` | `trips:read` |
| Students | `/dashboard/students` | `students:read` |
| Drivers | `/dashboard/drivers` | `drivers:read` |
| Vehicles | `/dashboard/vehicles` | `vehicles:read` |
| Devices | `/dashboard/devices` | `devices:read` |
| Schools | `/dashboard/schools` | `schools:read` |
| Reports | `/dashboard/reports` | `reports:read` |
| Settings | `/dashboard/settings` | `org:manage` |

- Filter: `item.permission === null || (user.permissions?.includes(item.permission) ?? false)`

**`dashboard-nav-user.tsx`** (client component)
- Same structure as `AdminNavUser` (avatar + dropdown)
- Logout redirects to `/` (org users have no generic login page)
- No profile link (org users do not have a `/dashboard/profile` page yet)

**`dashboard-site-header.tsx`** (client component)
- Left: `<SidebarTrigger />` + separator + `<DashboardBreadcrumb />`
- Right: alert bell (`useTripStream`, `AlertPanel` dropdown) - preserves existing SSE functionality from old `DashboardHeader`
- Accepts `orgId: string` for the SSE hook

**`dashboard-breadcrumb.tsx`** (client component)
- Same pattern as `AdminBreadcrumb`
- Strips `/dashboard` prefix
- Segment label map includes: `routes`, `trips`, `students`, `drivers`, `vehicles`, `devices`, `schools`, `reports`, `settings`, `users`, `roles`, `api-keys`, `sso`, `new`, `edit`, `attendance`, `ridership`, `performance`, `claim`, `provision`

#### 2b. Update layout

`app/dashboard/layout.tsx`

```tsx
<SidebarProvider style={{
  '--sidebar-width': 'calc(var(--spacing) * 64)',
  '--header-height': 'calc(var(--spacing) * 14)',
} as React.CSSProperties}>
  <DashboardAppSidebar user={user} variant="inset" />
  <SidebarInset>
    <DashboardSiteHeader orgId={user.org_id ?? ''} />
    <div className="flex flex-1 flex-col">
      <main className="flex-1 p-4 lg:p-6">{children}</main>
    </div>
  </SidebarInset>
</SidebarProvider>
```

#### 2c. Delete old components

- `components/dashboard/app-sidebar.tsx` - replaced by `dashboard-app-sidebar.tsx`
- `components/dashboard/header.tsx` - replaced by `dashboard-site-header.tsx`

## Files Changed

### routeguard-api/
- `internal/api/auth_handler.go` - fix Me() field names
- `internal/repository/org_repo.go` - add devices perms to org_admin
- `migrations/007_backfill_org_system_roles.up.sql` - new
- `migrations/007_backfill_org_system_roles.down.sql` - new (no-op)

### dashboard/
- `app/dashboard/layout.tsx` - switch to SidebarProvider pattern
- `components/dashboard/dashboard-app-sidebar.tsx` - new
- `components/dashboard/dashboard-nav-main.tsx` - new
- `components/dashboard/dashboard-nav-user.tsx` - new
- `components/dashboard/dashboard-site-header.tsx` - new
- `components/dashboard/dashboard-breadcrumb.tsx` - new
- `components/dashboard/app-sidebar.tsx` - delete
- `components/dashboard/header.tsx` - delete

## Non-Goals

- Adding a dedicated org profile page (`/dashboard/organization`)
- Changing the overview page content (stat cards remain as-is)
- Org user profile management
