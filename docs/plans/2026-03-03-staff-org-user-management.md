# Staff Org User Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow RouteGuard staff to list and create initial admin users for customer orgs from the admin panel.

**Architecture:** New repository + handler for org-scoped user management behind the existing admin middleware (`RequireStaff`). Frontend adds a users sub-page under each org's detail page, plus a create-user form. No migration needed - uses existing `users`, `user_identities`, `user_roles`, and `org_roles` tables.

**Tech Stack:** Go 1.24 (chi router, pgx, bcrypt via `crypto.HashPassword`), Next.js 16 App Router, React Hook Form + Zod, shadcn/ui, TypeScript.

---

### Task 1: Repository - OrgUserRepo

**Files:**
- Create: `routeguard-api/internal/repository/org_user_repo.go`

**Step 1: Create the repository file**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

// OrgUserRepo handles user queries scoped to a specific org for admin use.
type OrgUserRepo struct {
	pool *pgxpool.Pool
}

// NewOrgUserRepo creates a new OrgUserRepo.
func NewOrgUserRepo(pool *pgxpool.Pool) *OrgUserRepo {
	return &OrgUserRepo{pool: pool}
}

// ListByOrg returns all users belonging to orgID, ordered by name.
func (r *OrgUserRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
		FROM users
		WHERE org_id = $1
		ORDER BY name
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("org user list: %w", err)
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(
			&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("org user list scan: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// CreateWithPasswordAndAdminRole creates a new user for the org with a password identity
// and assigns the org's system org_admin role - all in a single transaction.
// Returns the created user. Returns an error if the email already exists in the org
// or if the org has no org_admin system role.
func (r *OrgUserRepo) CreateWithPasswordAndAdminRole(ctx context.Context, orgID, email, name, password string) (*domain.User, error) {
	hash, err := crypto.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("create org user: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var u domain.User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (org_id, email, name)
		VALUES ($1, $2, $3)
		RETURNING id, org_id, email, name, avatar_url, last_login_at, deleted_at, created_at
	`, orgID, email, name).Scan(
		&u.ID, &u.OrgID, &u.Email, &u.Name, &u.AvatarURL, &u.LastLoginAt, &u.DeletedAt, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create org user: insert user: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO user_identities (user_id, provider, password_hash)
		VALUES ($1, 'password', $2)
	`, u.ID, hash)
	if err != nil {
		return nil, fmt.Errorf("create org user: insert identity: %w", err)
	}

	var roleID string
	err = tx.QueryRow(ctx, `
		SELECT id FROM org_roles
		WHERE org_id = $1 AND name = 'org_admin' AND is_system = true
	`, orgID).Scan(&roleID)
	if err != nil {
		return nil, fmt.Errorf("create org user: find org_admin role: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO user_roles (id, user_id, role_id)
		VALUES (gen_random_uuid(), $1, $2)
		ON CONFLICT (user_id, role_id) DO NOTHING
	`, u.ID, roleID)
	if err != nil {
		return nil, fmt.Errorf("create org user: assign role: %w", err)
	}

	return &u, tx.Commit(ctx)
}
```

**Step 2: Verify it compiles**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/org_user_repo.go
git commit -m "feat: add OrgUserRepo for admin org user management"
```

---

### Task 2: Handler - ListOrgUsersAdmin and CreateOrgUserAdmin

**Files:**
- Create: `routeguard-api/internal/api/org_user_handler.go`
- Create: `routeguard-api/internal/api/org_user_handler_test.go`

**Step 1: Write the failing validation tests**

```go
package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateOrgUserAdmin_MissingBody(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/admin/organizations/abc/users", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	h.CreateOrgUserAdmin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestCreateOrgUserAdmin_ShortPassword(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/admin/organizations/abc/users",
		bytes.NewBufferString(`{"name":"Test","email":"t@t.com","password":"short"}`))
	w := httptest.NewRecorder()
	h.CreateOrgUserAdmin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}
```

**Step 2: Run tests to verify they fail**

```bash
cd routeguard-api && go test -v -run TestCreateOrgUserAdmin ./internal/api/
```

Expected: FAIL - `h.CreateOrgUserAdmin undefined`

**Step 3: Write the handler**

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/repository"
)

type orgUserResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	AvatarURL   *string `json:"avatar_url"`
	LastLoginAt *string `json:"last_login_at"`
	CreatedAt   string  `json:"created_at"`
}

// ListOrgUsersAdmin handles GET /admin/organizations/{id}/users
func (h *Handler) ListOrgUsersAdmin(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")

	orgRepo := repository.NewOrgRepo(h.pool)
	if _, err := orgRepo.Get(r.Context(), orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewOrgUserRepo(h.pool)
	users, err := repo.ListByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp := make([]orgUserResponse, 0, len(users))
	for _, u := range users {
		our := orgUserResponse{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			AvatarURL: u.AvatarURL,
			CreatedAt: u.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
		if u.LastLoginAt != nil {
			s := u.LastLoginAt.Format("2006-01-02T15:04:05Z")
			our.LastLoginAt = &s
		}
		resp = append(resp, our)
	}
	JSON(w, http.StatusOK, resp)
}

// CreateOrgUserAdmin handles POST /admin/organizations/{id}/users
func (h *Handler) CreateOrgUserAdmin(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "name, email, and password are required")
		return
	}
	if len(req.Password) < 8 {
		Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	orgRepo := repository.NewOrgRepo(h.pool)
	if _, err := orgRepo.Get(r.Context(), orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "organization not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewOrgUserRepo(h.pool)
	user, err := repo.CreateWithPasswordAndAdminRole(r.Context(), orgID, req.Email, req.Name, req.Password)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp := orgUserResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		AvatarURL: user.AvatarURL,
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	JSON(w, http.StatusCreated, resp)
	h.LogAudit(r, "org_user.created", "user", user.ID, map[string]any{"org_id": orgID})
}
```

**Step 4: Run tests to verify they pass**

```bash
cd routeguard-api && go test -v -run TestCreateOrgUserAdmin ./internal/api/
```

Expected: PASS

**Step 5: Verify full build**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 6: Commit**

```bash
git add routeguard-api/internal/api/org_user_handler.go routeguard-api/internal/api/org_user_handler_test.go
git commit -m "feat: add admin handlers for org user list and create"
```

---

### Task 3: Wire routes into server.go

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Add routes after the existing SSO org routes (around line 102)**

Find this block in `server.go`:
```go
		// SSO connections (admin manages by org)
		r.Get("/organizations/{id}/sso", h.ListOrgSSO)
		r.Post("/organizations/{id}/sso", h.CreateOrgSSO)
		r.Patch("/organizations/{id}/sso/{connectionId}", h.UpdateOrgSSO)
		r.Delete("/organizations/{id}/sso/{connectionId}", h.DeleteOrgSSO)
```

Add immediately after:
```go
		// Org users (admin bootstrap)
		r.Get("/organizations/{id}/users", h.ListOrgUsersAdmin)
		r.Post("/organizations/{id}/users", h.CreateOrgUserAdmin)
```

**Step 2: Build to confirm no errors**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 3: Run all tests**

```bash
cd routeguard-api && go test -v ./...
```

Expected: all PASS.

**Step 4: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire org user admin routes"
```

---

### Task 4: API client types and methods

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add the OrgUser interface**

In `api.ts`, find the block of domain type interfaces (around line 56, after the `User` interface). Add:

```ts
export interface OrgUser {
  id: string
  name: string
  email: string
  avatar_url: string | null
  last_login_at: string | null
  created_at: string
}
```

**Step 2: Add API methods**

In `api.ts`, find `admin.organizations` (around line 337). It currently ends with:
```ts
      delete: (id: string) => request<void>(`/admin/organizations/${id}`, { method: 'DELETE' }),
    },
```

Add a `users` key to the `organizations` object, so it becomes:
```ts
      delete: (id: string) => request<void>(`/admin/organizations/${id}`, { method: 'DELETE' }),
      users: {
        list: (orgId: string) => request<OrgUser[]>(`/admin/organizations/${orgId}/users`),
        create: (orgId: string, data: { name: string; email: string; password: string }) =>
          request<OrgUser>(`/admin/organizations/${orgId}/users`, {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      },
    },
```

**Step 3: Verify TypeScript compiles**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

Expected: build completes, 0 TypeScript errors.

**Step 4: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add OrgUser type and admin org users API methods"
```

---

### Task 5: Org users list page

**Files:**
- Create: `dashboard/app/admin/organizations/[id]/users/page.tsx`

**Step 1: Create the page**

```tsx
import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'

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

      {users.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-gray-500 text-sm mb-4">No users yet. Add the first admin user to get this org started.</p>
          <Link
            href={`/admin/organizations/${id}/users/new`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            <UserPlus size={14} />
            Add First User
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {users.map((user) => (
            <div key={user.id} className="flex items-center px-5 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-sm text-gray-500 truncate">{user.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">
                  {user.last_login_at
                    ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}`
                    : 'Never logged in'}
                </p>
                <p className="text-xs text-gray-400">
                  Added {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

Expected: 0 TypeScript errors.

**Step 3: Commit**

```bash
git add dashboard/app/admin/organizations/[id]/users/page.tsx
git commit -m "feat: add org users list page for admin"
```

---

### Task 6: Create org user page

**Files:**
- Create: `dashboard/app/admin/organizations/[id]/users/new/page.tsx`

**Step 1: Create the page**

This is a client component (uses form state). No separate wrapper needed since form data is small.

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
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

export default function NewOrgUserPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const orgId = params.id
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await api.admin.organizations.users.create(orgId, data)
      toast.success('User created')
      router.push(`/admin/organizations/${orgId}/users`)
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Add Org User</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create the initial admin account for this organization. They can set up SSO after logging in.
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
              <Input id="email" type="email" {...register('email')} placeholder="jane@school.org" />
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

**Step 2: Verify TypeScript compiles**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

Expected: 0 TypeScript errors.

**Step 3: Commit**

```bash
git add dashboard/app/admin/organizations/[id]/users/new/page.tsx
git commit -m "feat: add create org user page for admin"
```

---

### Task 7: Add Users button to org detail page

**Files:**
- Modify: `dashboard/app/admin/organizations/[id]/page.tsx`

**Step 1: Update the org detail page**

The current page has a single "Edit" button in the header. Add a "Users" button alongside it.

Find this block in `organizations/[id]/page.tsx`:
```tsx
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/organizations"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {org.name}
          </h1>
        </div>
        <Link
          href={`/admin/organizations/${org.id}/edit`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>
```

Replace with:
```tsx
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/organizations"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {org.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/organizations/${org.id}/users`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Users size={14} />
            Users
          </Link>
          <Link
            href={`/admin/organizations/${org.id}/edit`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            <Pencil size={14} />
            Edit
          </Link>
        </div>
      </div>
```

Also update the import at the top of the file to add `Users` to the lucide-react import:
```tsx
import { Pencil, ArrowLeft, Users } from 'lucide-react'
```

**Step 2: Lint and build**

```bash
cd dashboard && npm run lint && npm run build 2>&1 | tail -20
```

Expected: 0 lint errors, 0 TypeScript errors.

**Step 3: Commit**

```bash
git add dashboard/app/admin/organizations/[id]/page.tsx
git commit -m "feat: add Users button to org detail page"
```

---

## Manual Testing Checklist

After all tasks are complete, verify end-to-end in the browser:

1. Navigate to `/admin/organizations` and pick any org
2. Confirm the "Users" button appears alongside "Edit"
3. Click "Users" - confirm the users list page loads (empty state if no users)
4. Click "Add User" (or "Add First User") - confirm the create form loads
5. Fill in name, email, and a password under 8 chars - confirm validation error
6. Fill in valid data and submit - confirm redirect to the users list with the new user shown
7. Confirm the new user can log in at the org's login page with the password set by staff
