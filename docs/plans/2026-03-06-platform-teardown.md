# Platform Teardown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip RouteGuard to a bare skeleton - marketing site + empty Go API + deploy infra. DB reset done manually via SSH.

**Architecture:** Delete all application code (handlers, repos, domain types, auth, middleware, migrations, dashboard pages, components, device image builder). Keep only the Go API skeleton (main.go, config, db pool, cache, server with health endpoints), the Next.js marketing site, shadcn UI components, and deploy infrastructure.

**Tech Stack:** Go 1.24 (chi router), Next.js 16 (App Router), Docker Compose + Traefik

---

### Task 1: Delete dashboard app pages

Delete all non-marketing app route directories. These are entire directory trees.

**Files:**
- Delete: `dashboard/app/admin/` (20 files - org CRUD, staff, audit, contacts, devices, profile)
- Delete: `dashboard/app/dashboard/` (38 files - schools, students, drivers, vehicles, routes, trips, devices, settings, reports)
- Delete: `dashboard/app/driver/` (8 files - lock screen, bootstrap, enroll, pre-trip, active run, map)
- Delete: `dashboard/app/login/` (1 file - org-specific login)
- Delete: `dashboard/app/staff/` (1 file - staff login)
- Delete: `dashboard/app/api/auth/` (2 files - login/logout proxy routes)

**Step 1: Delete all directories**

```bash
cd B:/.dev/RouteGuard
rm -rf dashboard/app/admin dashboard/app/dashboard dashboard/app/driver dashboard/app/login dashboard/app/staff dashboard/app/api
```

**Step 2: Verify no broken imports from root layout**

The root `dashboard/app/layout.tsx` does not import from any of these directories (confirmed - it only imports fonts, Toaster, and globals.css). No changes needed.

---

### Task 2: Delete dashboard components

Delete all non-marketing, non-UI component directories.

**Files:**
- Delete: `dashboard/components/admin/` (17 files - org forms, tables, sidebar, SSO, audit, staff)
- Delete: `dashboard/components/dashboard/` (36 files - data tables, forms, maps, wizards, sidebars)
- Delete: `dashboard/components/driver/` (9 files - lock screen, pin pad, maps, scan, active run)
- Delete: `dashboard/components/auth/` (3 files - login forms, SSO button)
- Delete: `dashboard/components/map/` (1 file - map-view)

**Step 1: Delete all directories**

```bash
cd B:/.dev/RouteGuard
rm -rf dashboard/components/admin dashboard/components/dashboard dashboard/components/driver dashboard/components/auth dashboard/components/map
```

---

### Task 3: Clean up dashboard lib and middleware

Strip the API client, server-api helper, and middleware down to empty shells.

**Files:**
- Rewrite: `dashboard/lib/api.ts`
- Delete: `dashboard/lib/server-api.ts`
- Rewrite: `dashboard/middleware.ts`

**Step 1: Rewrite `dashboard/lib/api.ts`**

Replace the entire file with just the base fetch helper (no domain types, no API methods):

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const reqHeaders: Record<string, string> = {}

  if (!(init?.body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...reqHeaders,
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new APIError(res.status, body.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
```

**Step 2: Delete `dashboard/lib/server-api.ts`**

```bash
rm dashboard/lib/server-api.ts
```

**Step 3: Rewrite `dashboard/middleware.ts`**

Strip to just security headers (no auth redirects, no cookie checks):

```typescript
import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
```

---

### Task 4: Delete Go API application code

Delete all handlers, repositories, domain types, auth, middleware, and supporting packages.

**Files:**
- Delete: `routeguard-api/internal/api/` (entire directory - 39 files)
- Delete: `routeguard-api/internal/repository/` (entire directory - 23 files)
- Delete: `routeguard-api/internal/domain/` (entire directory - 1 file)
- Delete: `routeguard-api/internal/auth/` (entire directory - 4 files)
- Delete: `routeguard-api/internal/tripauth/` (entire directory - 1 file)
- Delete: `routeguard-api/internal/deviceauth/` (entire directory - 1 file)
- Delete: `routeguard-api/internal/middleware/` (entire directory - 6 files)
- Delete: `routeguard-api/internal/stream/` (entire directory - 1 file)
- Delete: `routeguard-api/internal/notifications/` (entire directory - 1 file)
- Delete: `routeguard-api/internal/crypto/` (entire directory - 4 files)
- Delete: `routeguard-api/internal/cleanup/` (entire directory - 1 file)
- Delete: `routeguard-api/internal/storage/` (entire directory - 1 file)
- Delete: `routeguard-api/migrations/` (entire directory - 24 files)

**Step 1: Delete all directories**

```bash
cd B:/.dev/RouteGuard
rm -rf routeguard-api/internal/api routeguard-api/internal/repository routeguard-api/internal/domain routeguard-api/internal/auth routeguard-api/internal/tripauth routeguard-api/internal/deviceauth routeguard-api/internal/middleware routeguard-api/internal/stream routeguard-api/internal/notifications routeguard-api/internal/crypto routeguard-api/internal/cleanup routeguard-api/internal/storage routeguard-api/migrations
```

---

### Task 5: Rewrite Go API server and main

Strip `server.go` to just health endpoints and rewrite `main.go` to remove all deleted package references.

**Files:**
- Rewrite: `routeguard-api/internal/server/server.go`
- Rewrite: `routeguard-api/cmd/api/main.go`

**Step 1: Rewrite `routeguard-api/internal/server/server.go`**

```go
package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
)

type Server struct {
	router chi.Router
	cfg    *config.Config
	pool   *pgxpool.Pool
	cache  *cache.Cache
}

func New(cfg *config.Config, pool *pgxpool.Pool, c *cache.Cache) *Server {
	s := &Server{cfg: cfg, pool: pool, cache: c}
	s.router = s.buildRouter()
	return s
}

func (s *Server) buildRouter() chi.Router {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	return r
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}
```

**Step 2: Rewrite `routeguard-api/cmd/api/main.go`**

```go
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/db"
	"github.com/routeguard/api/internal/server"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()
	log.Info().Msg("database connected")

	c := cache.New(cfg.RedisAddr, cfg.RedisPassword)
	if err := c.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to Redis")
	}
	defer c.Close()
	log.Info().Msg("Redis connected")

	srv := server.New(cfg, pool, c)

	httpSrv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", httpSrv.Addr).Msg("server starting")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server")
	ctx2, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := httpSrv.Shutdown(ctx2); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("server stopped")
}
```

---

### Task 6: Clean up Go config and dependencies

Strip config of unused fields and remove unused Go module dependencies.

**Files:**
- Rewrite: `routeguard-api/internal/config/config.go`
- Modify: `routeguard-api/go.mod` (via `go mod tidy`)

**Step 1: Rewrite `routeguard-api/internal/config/config.go`**

Remove all fields that are no longer needed (session keys, encryption keys, Twilio, Mapbox, storage, API key secret):

```go
package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port          string
	DatabaseURL   string
	RedisAddr     string
	RedisPassword string
	BaseURL       string
	IsProd        bool
}

func Load() (*Config, error) {
	return &Config{
		Port:          envOr("PORT", "8080"),
		DatabaseURL:   mustEnv("DATABASE_URL"),
		RedisAddr:     mustEnv("REDIS_ADDR"),
		RedisPassword: os.Getenv("REDIS_PASSWORD"),
		BaseURL:       envOr("BASE_URL", "http://localhost:3000"),
		IsProd:        os.Getenv("NODE_ENV") == "production" || os.Getenv("ENV") == "production",
	}, nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s is not set", key))
	}
	return v
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
```

**Step 2: Run `go mod tidy`**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go mod tidy
```

This will remove unused dependencies (AWS SDK, OIDC, SAML, oauth2, crypto, etc.) from `go.mod` and `go.sum`.

---

### Task 7: Delete device directory

Remove the entire device image builder and kiosk infrastructure.

**Files:**
- Delete: `device/` (entire directory - 15 files including .img.gz images)

**Step 1: Delete device directory**

```bash
cd B:/.dev/RouteGuard && rm -rf device
```

---

### Task 8: Remove unused dashboard dependencies

Remove packages that were only used by deleted pages (mapbox, leaflet, dnd-kit, papaparse, recharts, react-hook-form, swr, etc.).

**Step 1: Uninstall unused packages**

Check which packages are still imported by remaining code before removing. The marketing site uses: `cobe`, `motion`, `lucide-react`, `next-themes`. The UI components use: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `vaul`, `sonner`.

Packages to remove (only used by deleted pages):
```bash
cd B:/.dev/RouteGuard/dashboard
npm uninstall @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities @hookform/resolvers @tanstack/react-table @types/leaflet @types/mapbox-gl @types/papaparse leaflet mapbox-gl papaparse react-hook-form react-use-measure recharts swr zod date-fns
```

Also remove dev dependencies only used by deleted code:
```bash
npm uninstall @mapbox/point-geometry @types/mapbox__point-geometry
```

**Step 2: Verify remaining imports**

```bash
cd B:/.dev/RouteGuard/dashboard && npm run build
```

If any remaining marketing components use removed packages, add them back.

---

### Task 9: Verify everything builds

**Step 1: Build Go API**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./cmd/api
```

Expected: Successful build with no errors.

**Step 2: Lint and build dashboard**

```bash
cd B:/.dev/RouteGuard/dashboard && npm run lint && npm run build
```

Expected: 0 lint errors, successful build.

**Step 3: Fix any issues**

If either build fails, fix the specific compilation/import errors before proceeding.

---

### Task 10: Commit

**Step 1: Stage and commit all changes**

```bash
cd B:/.dev/RouteGuard
git add -A
git commit -m "feat: strip platform to skeleton - remove all app code, keep marketing site + empty API"
```

**Step 2: Verify clean state**

```bash
git status
```

Expected: Clean working tree, nothing to commit.
