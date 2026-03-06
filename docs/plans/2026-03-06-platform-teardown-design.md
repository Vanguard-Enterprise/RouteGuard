# Platform Teardown Design

Date: 2026-03-06

## Goal

Strip RouteGuard to a bare skeleton: marketing site + empty Go API + deploy infra. DB reset done manually via SSH.

## What Gets Deleted

### Go API (`routeguard-api/`)

- All handlers in `internal/api/` (auth, org, device, SSO, trips, schools, students, drivers, vehicles, routes, etc.)
- All repos in `internal/repository/`
- `internal/domain/types.go` - all domain types
- `internal/auth/` - sessions, OIDC, SAML
- `internal/tripauth/` - trip session context
- `internal/deviceauth/` - device auth context
- `internal/middleware/` - auth, RBAC, device auth, trip auth
- `internal/stream/` - SSE pub/sub
- `internal/notifications/` - Twilio SMS
- `internal/crypto/` - AES encrypt/decrypt
- `migrations/` - all SQL files (DB will be reset manually)
- `internal/server/server.go` - gut route registration, keep health/ready/metrics

### Dashboard (`dashboard/`)

- `app/admin/` - entire directory
- `app/dashboard/` - entire directory
- `app/driver/` - entire directory
- `app/login/` - entire directory
- `app/staff/` - entire directory
- `app/api/auth/` - auth proxy routes
- `components/admin/` - all admin components
- `components/dashboard/` - all dashboard components
- `components/driver/` - all driver components
- `components/auth/` - login forms
- `components/map/` - map components
- `lib/api.ts` - API client
- `lib/server-api.ts` - server auth helper
- `middleware.ts` - gut auth redirect logic

### Device (`device/`)

- Entire directory (pi-gen, setup scripts, image builders)

## What Stays

### Go API

- `cmd/api/main.go` - entry point
- `internal/server/server.go` - stripped to health/ready/metrics only
- `internal/config/` - env config loader
- `internal/db/` - pgx pool + migrate runner (for future use)
- `internal/cache/` - Redis wrapper (for future use)

### Dashboard

- `app/(marketing)/` - marketing pages
- `app/layout.tsx`, `app/globals.css` - root layout/styles
- `components/` root-level marketing components (hero, cta, footer, header, etc.)
- `components/ui/` - shadcn base components
- Tailwind config, `next.config.ts`, `package.json`

### Deploy

- Docker Compose, Traefik, scripts - unchanged

### Docs

- `docs/plans/` - design documents

## Execution Order

1. Delete dashboard pages/components (admin, dashboard, driver, login, staff, auth proxy)
2. Delete Go API handlers, repos, domain, auth, middleware
3. Strip `server.go` to health/ready/metrics
4. Delete `device/` directory
5. Delete migrations
6. Clean up dashboard `middleware.ts`, `lib/api.ts`, `lib/server-api.ts`
7. Verify: `npm run lint && npm run build` for dashboard, `go build ./cmd/api` for API
