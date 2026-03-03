# Staff Org User Management - Design

Date: 2026-03-03

## Problem

RouteGuard staff have no way to view or create users for customer orgs. When onboarding a new org, staff need to create the initial admin user so the org can log in and set up SSO themselves.

## Scope

- Staff can list users for any org
- Staff can create one or more initial users for an org (password auth)
- Created users are always assigned the org's system admin role
- Staff sets the initial password directly
- No email invite flow needed

## API Design

Two new endpoints under `/admin/organizations/{id}`, protected by `RequireStaffPermission("orgs:manage")`:

### GET /admin/organizations/{id}/users

Returns a list of users belonging to the org.

Response: array of `{ id, name, email, avatar_url, last_login_at, created_at }`

### POST /admin/organizations/{id}/users

Creates a new user for the org and assigns the org's system admin role.

Request body: `{ name, email, password }`

Validation:
- name, email, password all required
- password minimum 8 characters
- email must be unique within the org

In a single transaction:
1. INSERT into `users` (org_id, email, name)
2. bcrypt hash the password
3. INSERT into `user_identities` (user_id, provider='password', password_hash)
4. SELECT the org's system admin role (is_system=true, name='Admin') from `org_roles`
5. INSERT into `user_roles` (user_id, role_id)

Response: `{ id, name, email, created_at }`

### New repository file

`internal/repository/org_user_repo.go` - `OrgUserRepo` with:
- `ListByOrg(ctx, orgID) ([]domain.User, error)`
- `CreateWithPassword(ctx, orgID, email, name, passwordHash string) (*domain.User, error)` - returns the created user; role assignment done in the handler after creation

### New handler file

`internal/api/org_user_handler.go` - `ListOrgUsersAdmin` and `CreateOrgUserAdmin`

### Server wiring

```
r.Get("/organizations/{id}/users", h.ListOrgUsersAdmin)
r.Post("/organizations/{id}/users", h.CreateOrgUserAdmin)
```

Both protected by the same `RequireStaffPermission` middleware already applied to the admin router.

## Frontend Design

### New pages

- `app/admin/organizations/[id]/users/page.tsx` - server component; fetches user list; table with columns: name, email, last login, created; empty state with "Add first user" prompt; "Add user" button in header linking to `.../users/new`
- `app/admin/organizations/[id]/users/new/page.tsx` - server component shell wrapping `CreateOrgUserForm` client component; fields: name, email, password; on success redirects to `.../users`

### Modified page

`app/admin/organizations/[id]/page.tsx` - add "Users" button alongside existing "Edit" button linking to `.../users`

### API client additions

`dashboard/lib/api.ts` - add under `admin.organizations`:

```ts
users: {
  list: (orgId: string) => request<OrgUser[]>(`/admin/organizations/${orgId}/users`),
  create: (orgId: string, data: { name: string; email: string; password: string }) =>
    request<OrgUser>(`/admin/organizations/${orgId}/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
},
```

New `OrgUser` type:
```ts
interface OrgUser {
  id: string
  name: string
  email: string
  avatar_url: string | null
  last_login_at: string | null
  created_at: string
}
```

## No migrations needed

Uses existing tables: `users`, `user_identities`, `user_roles`, `org_roles`.
