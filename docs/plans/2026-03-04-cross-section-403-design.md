# Cross-Section 403 Enforcement

**Date:** 2026-03-04

## Problem

District (org) users can navigate to `/admin/*` pages and see the admin UI shell before being redirected to login. Staff users can reach the `/dashboard/*` shell with empty data. Neither shows a clear 403 error with navigation back to the correct section.

## Goals

- District users visiting `/admin/*` see a 403 page with a "Go to Dashboard" button.
- Staff users visiting `/dashboard/*` see a 403 page with a "Go to Admin" button.
- No per-request API calls added to middleware.

## Approach: Secondary `rg_user_type` Cookie

The `rg_session` cookie is an opaque Redis token - not a JWT - so middleware cannot decode it. Instead, a lightweight `rg_user_type` cookie (`staff` or `org`) is set at login time. Middleware reads this cookie to enforce routing without an API call.

The cookie is a UX hint only. The Go API enforces the real security boundaries:
- `/admin` routes: `Authenticate` + `RequireStaff` (blocks org users with 403)
- `/dashboard` routes: `Authenticate` + `RequirePermission(...)` (blocks staff users with 403 since they hold no org permissions)

## Changes

### 1. `dashboard/app/api/auth/login/route.ts`

Parse `is_staff` from the login response body. Set `rg_user_type=staff` or `rg_user_type=org` with matching path, domain, and TTL as `rg_session`.

### 2. `dashboard/app/api/auth/logout/route.ts`

Clear `rg_user_type` alongside `rg_session`.

### 3. `dashboard/middleware.ts`

After the existing session-missing redirect, add:
- If pathname starts with `/admin` and `rg_user_type` is present but not `staff` - redirect to `/forbidden?from=admin`.
- If pathname starts with `/dashboard` and `rg_user_type` is present but not `org` - redirect to `/forbidden?from=dashboard`.

Only act when `rg_user_type` is present - if missing, fall through to let layout handle it (existing redirect-to-login behavior).

### 4. `dashboard/app/forbidden/page.tsx` (new)

Standalone page outside all authenticated layouts. Shows:
- Lock icon, "Access Denied" heading
- Short explanation sentence
- Button: "Go to Dashboard" (when `from=admin`) or "Go to Admin" (when `from=dashboard`), falling back to "Go Home" (`/`) if param is absent

## Security Note

Cookie tampering bypasses the UX 403 but not the API. A tampered org user reaching `/admin` gets redirected to login by the layout (which calls `/admin/profile` - staff-only). A tampered staff user reaching `/dashboard` sees an empty shell; all data calls return 403 from Go. The API is the real enforcer.

## Out of Scope

Hardening `dashboard/layout.tsx` to also check `org_id` - this is a separate concern.
