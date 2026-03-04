# Remove Org User - Design

**Goal:** Allow super admins to hard-delete users from an org via the admin UI, unblocking org deletion.

**Approach:** Option A - hard-delete + fix the DeleteOrg guard.

---

## Go API

### 1. `OrgUserRepo.HardDelete(ctx, orgID, userID)`
Deletes `WHERE id = $1 AND org_id = $2` (org scope prevents cross-org deletion). No soft-delete - org users have no recovery flow.

### 2. `DeleteOrgUserAdmin` handler
`DELETE /admin/organizations/{id}/users/{userId}`
- Verify org exists (404 if not)
- Call `HardDelete`; 404 if user not found in that org
- Invalidate all sessions for the deleted user via `auth.InvalidateUserSessions`
- Return 204
- Audit log: `org_user.deleted`

### 3. Fix `DeleteOrg` guard
Change `WHERE org_id = $1` to `WHERE org_id = $1 AND deleted_at IS NULL` so soft-deleted users do not block org deletion.

### 4. Route wiring
Add to `server.go` admin block:
```
r.Delete("/organizations/{id}/users/{userId}", h.DeleteOrgUserAdmin)
```

---

## API Client

Add to `lib/api.ts` under `api.admin.organizations.users`:
```ts
delete: (orgId: string, userId: string) =>
  request<void>(`/admin/organizations/${orgId}/users/${userId}`, { method: 'DELETE' }),
```

---

## UI

### `OrgUsersTable` client component
New file: `components/admin/org-users-table.tsx`
- Receives `orgId: string` and `users: OrgUser[]` as props
- Local state for user list (optimistic removal on delete)
- Trash icon button per row
- Confirm dialog: "Remove [name]? This permanently deletes their account and cannot be undone."
- On confirm: calls `api.admin.organizations.users.delete(orgId, user.id)`, removes row from state, calls `router.refresh()`
- Error handling: `toast.error(err.message)` on failure

### `app/admin/organizations/[id]/users/page.tsx`
- Remains a server component
- Passes `orgId` and fetched `users` to `<OrgUsersTable>`
- Removes the inline user list rendering

---

## Files Changed

| File | Change |
|------|--------|
| `routeguard-api/internal/repository/org_user_repo.go` | Add `HardDelete` |
| `routeguard-api/internal/api/org_user_handler.go` | Add `DeleteOrgUserAdmin` |
| `routeguard-api/internal/api/org_handler.go` | Fix `DeleteOrg` guard |
| `routeguard-api/internal/server/server.go` | Wire route |
| `dashboard/lib/api.ts` | Add `users.delete` |
| `dashboard/components/admin/org-users-table.tsx` | New client component |
| `dashboard/app/admin/organizations/[id]/users/page.tsx` | Wire `OrgUsersTable` |
