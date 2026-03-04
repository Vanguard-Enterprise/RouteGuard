# Remove Org User Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a delete button to the org users admin page that hard-deletes a user from an org, unblocking org deletion.

**Architecture:** Four layers - repo method (hard-delete scoped to org), API handler + route, TypeScript client method, and a new client component `OrgUsersTable` that owns the delete interaction. The existing `DeleteOrg` guard is also fixed to exclude soft-deleted users.

**Tech Stack:** Go 1.24 (chi, pgx), Next.js 16 App Router, shadcn/ui AlertDialog, Sonner toasts.

---

### Task 1: Add `OrgUserRepo.HardDelete`

**Files:**
- Modify: `routeguard-api/internal/repository/org_user_repo.go`

**Step 1: Write the failing test**

Add to `routeguard-api/internal/api/org_user_handler_test.go` (check if the file already has tests - add after the last test):

```go
func TestDeleteOrgUserAdmin_MissingIDs(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodDelete, "/admin/organizations/org-1/users/user-1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "")
	rctx.URLParams.Add("userId", "")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.DeleteOrgUserAdmin(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", w.Code)
	}
}
```

**Step 2: Run to verify it fails**

```bash
cd routeguard-api
go test -v -run TestDeleteOrgUserAdmin_MissingIDs ./internal/api/
```

Expected: FAIL - `h.DeleteOrgUserAdmin undefined`

**Step 3: Add `HardDelete` to the repo**

Append to `routeguard-api/internal/repository/org_user_repo.go`:

```go
// HardDelete permanently deletes a user scoped to orgID.
// Returns pgx.ErrNoRows if no matching user is found.
func (r *OrgUserRepo) HardDelete(ctx context.Context, orgID, userID string) error {
	tag, err := r.pool.Exec(ctx,
		"DELETE FROM users WHERE id = $1 AND org_id = $2",
		userID, orgID,
	)
	if err != nil {
		return fmt.Errorf("org user hard delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
```

You'll need to add `"github.com/jackc/pgx/v5"` to the import block in `org_user_repo.go` if it isn't already there.

**Step 4: Add `DeleteOrgUserAdmin` handler**

Append to `routeguard-api/internal/api/org_user_handler.go`:

```go
// DeleteOrgUserAdmin handles DELETE /admin/organizations/{id}/users/{userId}
func (h *Handler) DeleteOrgUserAdmin(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	userID := chi.URLParam(r, "userId")
	if orgID == "" || userID == "" {
		Error(w, http.StatusNotFound, "not found")
		return
	}

	repo := repository.NewOrgUserRepo(h.pool)
	if err := repo.HardDelete(r.Context(), orgID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "user not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	_ = auth.InvalidateUserSessions(r.Context(), h.cache, userID)
	NoContent(w)
	h.LogAudit(r, "org_user.deleted", "user", userID, map[string]any{"org_id": orgID})
}
```

**Step 5: Run the test to verify it passes**

```bash
go test -v -run TestDeleteOrgUserAdmin_MissingIDs ./internal/api/
```

Expected: PASS

**Step 6: Run all tests**

```bash
go test -v ./...
```

Expected: all PASS

**Step 7: Commit**

```bash
git add internal/repository/org_user_repo.go internal/api/org_user_handler.go internal/api/org_user_handler_test.go
git commit -m "feat: add HardDelete to OrgUserRepo and DeleteOrgUserAdmin handler"
```

---

### Task 2: Wire the route and fix the DeleteOrg guard

**Files:**
- Modify: `routeguard-api/internal/server/server.go:108-109`
- Modify: `routeguard-api/internal/api/org_handler.go:119-128` (the user count guard)

**Step 1: Wire the route**

In `routeguard-api/internal/server/server.go`, find the org users block:

```go
// Org users (admin bootstrap)
r.Get("/organizations/{id}/users", h.ListOrgUsersAdmin)
r.Post("/organizations/{id}/users", h.CreateOrgUserAdmin)
```

Add the delete route:

```go
// Org users (admin bootstrap)
r.Get("/organizations/{id}/users", h.ListOrgUsersAdmin)
r.Post("/organizations/{id}/users", h.CreateOrgUserAdmin)
r.Delete("/organizations/{id}/users/{userId}", h.DeleteOrgUserAdmin)
```

**Step 2: Fix the DeleteOrg guard**

In `routeguard-api/internal/api/org_handler.go`, find the user count guard:

```go
err := h.pool.QueryRow(r.Context(),
    "SELECT COUNT(*) FROM users WHERE org_id = $1", id,
).Scan(&userCount)
```

Replace with:

```go
err := h.pool.QueryRow(r.Context(),
    "SELECT COUNT(*) FROM users WHERE org_id = $1 AND deleted_at IS NULL", id,
).Scan(&userCount)
```

**Step 3: Run all tests**

```bash
go test -v ./...
```

Expected: all PASS

**Step 4: Commit**

```bash
git add internal/server/server.go internal/api/org_handler.go
git commit -m "fix: wire delete org user route and exclude soft-deleted users from org delete guard"
```

---

### Task 3: Add `users.delete` to the TypeScript API client

**Files:**
- Modify: `dashboard/lib/api.ts:350-357`

**Step 1: Add the delete method**

Find the `users` block under `api.admin.organizations`:

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

Add `delete`:

```ts
users: {
  list: (orgId: string) => request<OrgUser[]>(`/admin/organizations/${orgId}/users`),
  create: (orgId: string, data: { name: string; email: string; password: string }) =>
    request<OrgUser>(`/admin/organizations/${orgId}/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (orgId: string, userId: string) =>
    request<void>(`/admin/organizations/${orgId}/users/${userId}`, { method: 'DELETE' }),
},
```

**Step 2: Lint check**

```bash
cd dashboard
npm run lint
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add lib/api.ts
git commit -m "feat: add users.delete to admin organizations API client"
```

---

### Task 4: Create `OrgUsersTable` client component and wire the page

**Files:**
- Create: `dashboard/components/admin/org-users-table.tsx`
- Modify: `dashboard/app/admin/organizations/[id]/users/page.tsx`

**Step 1: Create the component**

Create `dashboard/components/admin/org-users-table.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api, type OrgUser } from '@/lib/api'

interface OrgUsersTableProps {
  orgId: string
  initialUsers: OrgUser[]
}

export function OrgUsersTable({ orgId, initialUsers }: OrgUsersTableProps) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.admin.organizations.users.delete(orgId, deleteTarget.id)
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove user.'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-gray-500 text-sm mb-4">No users yet. Add the first admin user to get this org started.</p>
        <Link
          href={`/admin/organizations/${orgId}/users/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <UserPlus size={14} />
          Add First User
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {users.map((user) => (
          <div key={user.id} className="flex items-center px-5 py-3 gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  {user.last_login_at
                    ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}`
                    : 'Never logged in'}
                </p>
                <p className="text-xs text-gray-400">
                  Added {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(user)}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove user"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) and their account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

**Step 2: Update the page to use the component**

Replace the contents of `dashboard/app/admin/organizations/[id]/users/page.tsx`:

```tsx
import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { OrgUsersTable } from '@/components/admin/org-users-table'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getOrg(id: string) {
  try {
    return await api.admin.organizations.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

async function getUsers(id: string) {
  try {
    return await api.admin.organizations.users.list(id)
  } catch {
    return []
  }
}

export default async function OrgUsersPage({ params }: PageProps) {
  const { id } = await params
  const [org, users] = await Promise.all([getOrg(id), getUsers(id)])
  if (!org) notFound()

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/organizations/${id}`}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {org.name} - Users
          </h1>
        </div>
        <Link
          href={`/admin/organizations/${id}/users/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <UserPlus size={14} />
          Add User
        </Link>
      </div>

      <OrgUsersTable orgId={id} initialUsers={users} />
    </div>
  )
}
```

**Step 3: Lint check**

```bash
cd dashboard
npm run lint
```

Expected: 0 errors

**Step 4: Build**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors

**Step 5: Commit**

```bash
git add components/admin/org-users-table.tsx app/admin/organizations/[id]/users/page.tsx
git commit -m "feat: add delete user button to org users admin page"
```
