# Staff User & RBAC System - Design

**Date:** 2026-03-03
**Scope:** RouteGuard internal staff only (`/admin` panel). Not for school org users.

## Problem

All staff users currently have identical, unrestricted access to every `/admin` route. There is no way to grant limited permissions to staff members or to manage staff accounts through the UI.

## Goals

- Custom staff roles with fine-grained permissions
- Protected `super_admin` system role that always exists
- Manual staff user creation (name, email, password) in the UI
- Staff role assignment in the UI
- Soft delete with 30-day recovery window, then hard delete
- Immediate session invalidation on soft delete

## Approach

Separate `staff_roles` and `staff_user_roles` tables, independent of the existing `org_roles` / `user_roles` tables. No changes to org RBAC.

---

## Database Schema

Migration `005_staff_rbac.up.sql`:

```sql
-- Soft delete support for users
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- Staff roles
CREATE TABLE staff_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOL NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO staff_roles (name, permissions, is_system) VALUES (
  'super_admin',
  ARRAY['orgs:read','orgs:write','devices:read','devices:write','audit:read','staff:manage'],
  true
);

-- Staff user <-> role assignments
CREATE TABLE staff_user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES staff_roles(id) ON DELETE CASCADE,
  UNIQUE (user_id, role_id)
);
```

### Permission Strings

| Permission | Description |
|---|---|
| `orgs:read` | View organizations and SSO connections |
| `orgs:write` | Create, update, and delete organizations and SSO connections |
| `devices:read` | View devices |
| `devices:write` | Create, update, and delete devices |
| `audit:read` | View audit logs |
| `staff:manage` | Full CRUD for staff users and roles |

`super_admin` holds all six permissions and `is_system = true`. System roles cannot be renamed, edited, or deleted.

---

## Backend

### New Files

- `routeguard-api/internal/repository/staff_role_repo.go` - CRUD for `staff_roles` and `staff_user_roles`; `GetStaffUserPermissions(userID)` for loading permissions at login
- `routeguard-api/internal/api/staff_handler.go` - all staff user and role handlers

### Modified Files

- `internal/domain/types.go` - add `StaffRole`, `StaffUserRole` types; add `DeletedAt *time.Time` to `User`
- `internal/api/auth_handler.go` - staff login calls `GetStaffUserPermissions`; block login if `deleted_at IS NOT NULL`
- `internal/middleware/rbac.go` - add `RequireStaffPermission(permission string)`
- `internal/server/server.go` - wire new routes
- `cmd/api/main.go` - add daily hard-delete goroutine

### API Routes

All routes require `RequireStaff` + `RequireStaffPermission("staff:manage")`.

```
GET    /admin/staff/users
POST   /admin/staff/users
GET    /admin/staff/users/{id}
PATCH  /admin/staff/users/{id}
DELETE /admin/staff/users/{id}                 (soft delete)
POST   /admin/staff/users/{id}/restore
GET    /admin/staff/users/{id}/roles
POST   /admin/staff/users/{id}/roles
DELETE /admin/staff/users/{id}/roles/{roleId}

GET    /admin/staff/roles
POST   /admin/staff/roles
GET    /admin/staff/roles/{id}
PATCH  /admin/staff/roles/{id}
DELETE /admin/staff/roles/{id}
```

### Session Invalidation on Soft Delete

A Redis set `user_sessions:{userID}` tracks all active session tokens for a user.

- `CreateSession` - `SADD user_sessions:{userID} {token}` with 7-day TTL
- `DestroySession` - `SREM user_sessions:{userID} {token}`
- Soft delete - read all tokens from `user_sessions:{userID}`, `DEL` each session key and the set itself

### Background Hard Delete

A goroutine in `cmd/api/main.go` runs daily via `time.Ticker`. It deletes rows from `users` where `deleted_at < NOW() - INTERVAL '30 days'` AND `org_id IS NULL`, then cleans up the corresponding Redis sets.

---

## Frontend

### New Pages

```
app/admin/staff/users/page.tsx          - staff user list
app/admin/staff/users/new/page.tsx      - create staff user form
app/admin/staff/users/[id]/page.tsx     - view/edit + role assignment
app/admin/staff/roles/page.tsx          - role list
app/admin/staff/roles/new/page.tsx      - create role
app/admin/staff/roles/[id]/page.tsx     - edit role
```

### Staff User List

Table columns: name, email, roles, last login, status. Soft-deleted users display a destructive badge "Deleted - removes in X days" and a Restore button. Users within 7 days of permanent removal get an additional warning indicator.

### Create Staff User Form

Fields: name, email, password (shown once). User is created with no roles; roles are assigned from the user detail page after creation.

### Role Create/Edit

Name field plus a checklist of all 6 permission strings. System roles (`is_system = true`) show a lock icon; edit and delete actions are disabled both in the UI and enforced at the API.

### Sidebar

A "Staff" section is added to `AdminAppSidebar` with links to Users and Roles. The section is only rendered when the current session includes the `staff:manage` permission.

### API Client

Typed wrappers added to `dashboard/lib/api.ts` under `api.admin.staff.*` following existing patterns.
