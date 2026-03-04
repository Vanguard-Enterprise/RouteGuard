# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

| Directory | Description |
|-----------|-------------|
| `routeguard-api/` | Go 1.24 API backend (`api.route-guard.com`) |
| `dashboard/` | Next.js 16 frontend (`route-guard.com`) |
| `deploy/` | Docker Compose, Traefik, deployment scripts |
| `device/pi-gen/` | Raspberry Pi OS image build |
| `docs/plans/` | Architecture and implementation docs |

## Go API (`routeguard-api/`)

### Build & Test

```bash
cd routeguard-api
go build ./cmd/api           # build
go test -v ./...             # all tests
go test -v -run TestName ./internal/auth/  # specific test
```

### Internal Package Layout

```
internal/
  api/          # HTTP handlers — one file per resource (handler.go is the Handler struct)
  domain/       # All domain types in types.go — single source of truth
  repository/   # Postgres queries — one file per resource (*_repo.go)
  cache/        # Redis wrapper
  auth/         # session.go (Redis sessions), oidc.go, saml.go
  deviceauth/   # Device auth context (context.go)
  tripauth/     # Trip session context (context.go)
  stream/       # SSE + Redis pub/sub (sse.go)
  notifications/# Twilio SMS (sms.go)
  middleware/   # Auth, RBAC, rate limiting
  config/       # Config loaded from env vars
  crypto/       # AES-256-GCM encrypt/decrypt
  db/           # pgx pool + golang-migrate runner
migrations/     # SQL files — up/down pairs, numbered sequentially
```

### Adding a New Endpoint

1. Add the domain type to `internal/domain/types.go`
2. Add the repository method in `internal/repository/<resource>_repo.go`
3. Add the handler in `internal/api/<resource>_handler.go`
4. Wire the route in `internal/server/server.go` with appropriate middleware
5. Add the corresponding API method to `dashboard/lib/api.ts`

## Dashboard (`dashboard/`)

### Dev & Build

```bash
cd dashboard
npm run dev    # dev server on :3000
npm run build  # production build
npm run lint   # ESLint
```

### Key Architecture

- **Next.js App Router** with React 19, TypeScript, Tailwind v4, shadcn/ui
- **No direct DB access** — all data fetched from the Go API
- **Auth proxying:** Login/logout go through Next.js route handlers (`app/api/auth/login/`, `app/api/auth/logout/`) to set the `rg_session` cookie from `route-guard.com` (avoids cross-origin cookie restriction). Never call Go auth endpoints directly from the browser.
- **API client (`lib/api.ts`):** Typed wrapper around `fetch`. In server contexts (RSC/layouts), it auto-forwards the `rg_session` cookie by importing `next/headers`. Auth calls use `authRequest()` (relative URL via proxy); all other calls use `request()` (absolute URL to `NEXT_PUBLIC_API_URL`).
- **Server auth (`lib/server-api.ts`):** `getServerUser()` — use in server components and layout auth checks.
- **Middleware (`middleware.ts`):** Soft redirect to `/staff/login` if `rg_session` cookie is absent on `/dashboard` or `/admin` paths. Also sets CSP and security headers.
- **Components:** `components/ui/` — shadcn base; `components/dashboard/`, `components/admin/`, `components/driver/`, `components/map/`, `components/marketing/`
- **SWR** for client-side data fetching; **Sonner** for toasts; **React Hook Form + Zod** for forms; **Mapbox GL JS** for maps

### App Router Sections

| Path | Audience |
|------|----------|
| `app/(marketing)/` | Public pages |
| `app/login/[slug]/` | Org-specific login (SSO/password) |
| `app/staff/login/` | Staff-only login |
| `app/dashboard/` | Org admin/school admin panel |
| `app/admin/` | Super admin panel |
| `app/driver/` | Driver PWA |
| `app/api/auth/` | Auth proxy routes (login, logout) |

## Writing Style

Never use em dashes (—), en dashes (–), or any dash wider than a regular hyphen (-) in code, comments, strings, commit messages, or any written output.

## Pre-Push Checklist

Always run both commands and confirm they pass before pushing:

```bash
cd dashboard
npm run lint   # must have 0 errors
npm run build  # must complete without TypeScript errors
```

## Deployment

Stack: Traefik + PostgreSQL 16 + Redis 7 + Go API + Next.js dashboard + local Docker registry, all via Docker Compose in `deploy/`.

```bash
cd deploy
./scripts/deploy.sh   # pull, up -d, run migrations
docker compose ps
docker compose logs routeguard-api --tail 50
```

Traefik uses static certs from `deploy/traefik/certs/` (acme.sh). CI/CD via GitHub Actions self-hosted runner on the LXC; pushes Docker images to `localhost:5000` registry on the host.

### Additional Notes
The server running our infrastructure is located at 10.1.40.125. You can login using the deploy/keys and the root user.
The test kiosk device is Proxmox VM 100 (routeguard-kiosk) on pve1a (10.1.40.15) at 10.1.40.254. SSH as root (password: routeguard) or as user routeguard (password: routeguard).