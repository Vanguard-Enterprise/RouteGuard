# RouteGuard Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ground-up rebuild of RouteGuard as a self-hosted enterprise school bus fleet management platform with a Next.js dashboard, Go API backend, PostgreSQL + Redis data layer, custom auth (email/password + OIDC + SAML), pre-provisioned SBC driver tablets, and real-time GPS/scan streaming.

**Architecture:** Next.js 16 (pure frontend, no DB access) at `route-guard.com` calls a Go API at `api.route-guard.com` for all data. Go owns PostgreSQL (all persistent data) and Redis (sessions, pub/sub, cache, rate limiting). Real-time GPS and scan events flow from SBC devices → Go → Redis pub/sub → Next.js SSE → browser map. All services run in Docker containers on an LXC node with Traefik for routing and TLS.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · Mapbox GL JS · Go · chi router · pgx/v5 · go-redis/v9 · golang-migrate · coreos/go-oidc · crewjam/saml · bcrypt · Argon2id · AES-256-GCM · Twilio · PostgreSQL 16 · Redis 7 · Traefik · Docker · GitHub Actions

**Design reference:** `docs/plans/2026-03-01-routeguard-rework-design.md`

---

## Phase 1: Monorepo Setup & Clean Slate

### Task 1: Clean existing repo and scaffold monorepo

**Files:**
- Delete: all existing Next.js files at repo root (keep `docs/`, `.git/`)
- Create: `dashboard/` · `routeguard-api/` · `deploy/` · `device/`

**Step 1: Remove old Next.js root files**

```bash
cd B:/.dev/RouteGuard
# Remove old Next.js project files (keep docs/ and .git/)
rm -rf src node_modules .next public scripts drizzle
rm -f package.json package-lock.json tsconfig.json tsconfig.tsbuildinfo \
      next.config.ts next-env.d.ts drizzle.config.ts open-next.config.ts \
      wrangler.jsonc postcss.config.mjs eslint.config.mjs components.json \
      logo.png
```

**Step 2: Create monorepo folders**

```bash
mkdir -p dashboard routeguard-api deploy/traefik deploy/scripts device/pi-gen
```

**Step 3: Create root .gitignore**

```
# Dashboard
dashboard/node_modules/
dashboard/.next/
dashboard/.env.local

# Go API
routeguard-api/bin/
routeguard-api/.env

# Deploy
deploy/.env

# OS
.DS_Store
Thumbs.db
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: clean slate monorepo scaffold"
```

---

### Task 2: Docker Compose + Traefik infrastructure

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/traefik/traefik.yml`
- Create: `deploy/traefik/dynamic.yml`
- Create: `deploy/.env.example`

**Step 1: Write docker-compose.yml**

```yaml
# deploy/docker-compose.yml
version: "3.9"

services:
  traefik:
    image: traefik:v3.1
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./traefik/dynamic.yml:/etc/traefik/dynamic.yml:ro
      - traefik-certs:/certs
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [rg-net]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks: [rg-net]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    networks: [rg-net]

  routeguard-api:
    image: localhost:5000/routeguard-api:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable
      REDIS_ADDR: redis:6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      SESSION_ENCRYPTION_KEY: ${SESSION_ENCRYPTION_KEY}
      DATA_ENCRYPTION_KEY: ${DATA_ENCRYPTION_KEY}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_FROM_NUMBER: ${TWILIO_FROM_NUMBER}
      JWT_SECRET: ${JWT_SECRET}
      BASE_URL: https://route-guard.com
      API_BASE_URL: https://api.route-guard.com
    depends_on: [postgres, redis]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.route-guard.com`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=8080"
    networks: [rg-net]

  dashboard:
    image: localhost:5000/routeguard-dashboard:latest
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: https://api.route-guard.com
      NEXT_PUBLIC_MAPBOX_TOKEN: ${MAPBOX_TOKEN}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`route-guard.com`) || Host(`www.route-guard.com`)"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.services.dashboard.loadbalancer.server.port=3000"
    networks: [rg-net]

  registry:
    image: registry:2
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry
    networks: [rg-net]

volumes:
  postgres-data:
  redis-data:
  traefik-certs:
  registry-data:

networks:
  rg-net:
    driver: bridge
```

**Step 2: Write traefik.yml**

```yaml
# deploy/traefik/traefik.yml
api:
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entrypoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@route-guard.com
      storage: /certs/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
  file:
    filename: /etc/traefik/dynamic.yml
    watch: true
```

**Step 3: Write .env.example**

```env
POSTGRES_DB=routeguard
POSTGRES_USER=routeguard
POSTGRES_PASSWORD=changeme

REDIS_PASSWORD=changeme

# 32-byte hex keys (generate: openssl rand -hex 32)
SESSION_ENCRYPTION_KEY=
DATA_ENCRYPTION_KEY=
JWT_SECRET=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

MAPBOX_TOKEN=
```

**Step 4: Commit**

```bash
git add deploy/
git commit -m "feat: add docker-compose and traefik infrastructure"
```

---

### Task 3: GitHub Actions CI skeleton

**Files:**
- Create: `.github/workflows/api.yml`
- Create: `.github/workflows/dashboard.yml`
- Create: `.github/workflows/device-image.yml`

**Step 1: Write api.yml**

```yaml
# .github/workflows/api.yml
name: Build & Deploy API

on:
  push:
    branches: [main]
    paths: ["routeguard-api/**"]

jobs:
  build-deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: |
          docker build -t localhost:5000/routeguard-api:latest \
            -t localhost:5000/routeguard-api:${{ github.sha }} \
            routeguard-api/

      - name: Push to local registry
        run: |
          docker push localhost:5000/routeguard-api:latest
          docker push localhost:5000/routeguard-api:${{ github.sha }}

      - name: Deploy
        working-directory: deploy
        run: |
          docker compose pull routeguard-api
          docker compose up -d --no-deps routeguard-api
```

**Step 2: Write dashboard.yml** (same structure, paths: `dashboard/**`, service: `dashboard`)

**Step 3: Write device-image.yml**

```yaml
# .github/workflows/device-image.yml
name: Build Device Image

on:
  release:
    types: [published]

jobs:
  build:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Build RPi image
        run: |
          cd device/pi-gen
          docker build -t pi-gen-builder .
          docker run --rm --privileged \
            -v $(pwd)/output:/pi-gen/deploy \
            pi-gen-builder

      - name: Upload to release
        uses: softprops/action-gh-release@v2
        with:
          files: device/pi-gen/output/*.img.gz
```

**Step 4: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions CI/CD workflows"
```

---

## Phase 2: Go API Foundation

### Task 4: Initialize Go module and server

**Files:**
- Create: `routeguard-api/go.mod`
- Create: `routeguard-api/cmd/api/main.go`
- Create: `routeguard-api/internal/server/server.go`

**Step 1: Initialize Go module**

```bash
cd routeguard-api
go mod init github.com/routeguard/api
go get github.com/go-chi/chi/v5@latest
go get github.com/go-chi/chi/v5/middleware@latest
go get github.com/jackc/pgx/v5@latest
go get github.com/redis/go-redis/v9@latest
go get golang.org/x/crypto@latest
go get github.com/coreos/go-oidc/v3@latest
go get golang.org/x/oauth2@latest
go get github.com/crewjam/saml@latest
go get github.com/golang-migrate/migrate/v4@latest
go get github.com/golang-migrate/migrate/v4/database/pgx/v5@latest
go get github.com/golang-migrate/migrate/v4/source/file@latest
go get github.com/rs/zerolog@latest
```

**Step 2: Write main.go**

```go
// routeguard-api/cmd/api/main.go
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
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/server"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	srv, err := server.New(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create server")
	}

	httpSrv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", httpSrv.Addr).Msg("starting server")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
}
```

**Step 3: Write config/config.go**

```go
// routeguard-api/internal/config/config.go
package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port               string
	DatabaseURL        string
	RedisAddr          string
	RedisPassword      string
	SessionKey         []byte // 32 bytes, hex-decoded
	DataEncryptionKey  []byte // 32 bytes, hex-decoded
	TwilioAccountSID   string
	TwilioAuthToken    string
	TwilioFromNumber   string
	BaseURL            string
	APIBaseURL         string
}

func Load() (*Config, error) {
	sessionKey, err := decodeHexKey(env("SESSION_ENCRYPTION_KEY"))
	if err != nil {
		return nil, fmt.Errorf("SESSION_ENCRYPTION_KEY: %w", err)
	}
	dataKey, err := decodeHexKey(env("DATA_ENCRYPTION_KEY"))
	if err != nil {
		return nil, fmt.Errorf("DATA_ENCRYPTION_KEY: %w", err)
	}
	return &Config{
		Port:              envOr("PORT", "8080"),
		DatabaseURL:       env("DATABASE_URL"),
		RedisAddr:         env("REDIS_ADDR"),
		RedisPassword:     env("REDIS_PASSWORD"),
		SessionKey:        sessionKey,
		DataEncryptionKey: dataKey,
		TwilioAccountSID:  os.Getenv("TWILIO_ACCOUNT_SID"),
		TwilioAuthToken:   os.Getenv("TWILIO_AUTH_TOKEN"),
		TwilioFromNumber:  os.Getenv("TWILIO_FROM_NUMBER"),
		BaseURL:           envOr("BASE_URL", "http://localhost:3000"),
		APIBaseURL:        envOr("API_BASE_URL", "http://localhost:8080"),
	}, nil
}

func env(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s not set", key))
	}
	return v
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func decodeHexKey(s string) ([]byte, error) {
	if len(s) != 64 {
		return nil, fmt.Errorf("must be 64 hex chars (32 bytes)")
	}
	var b [32]byte
	_, err := fmt.Sscanf(s, "%x", &b)
	return b[:], err
}
```

**Step 4: Write server.go skeleton**

```go
// routeguard-api/internal/server/server.go
package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/routeguard/api/internal/config"
)

type Server struct {
	router chi.Router
}

func New(cfg *config.Config) (*Server, error) {
	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	return &Server{router: r}, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}
```

**Step 5: Verify server compiles**

```bash
cd routeguard-api
go build ./...
```

Expected: no output (success)

**Step 6: Commit**

```bash
git add routeguard-api/
git commit -m "feat: initialize Go API module and server skeleton"
```

---

### Task 5: PostgreSQL connection + migration runner

**Files:**
- Create: `routeguard-api/internal/db/db.go`
- Create: `routeguard-api/internal/db/migrate.go`
- Create: `routeguard-api/migrations/` (directory)

**Step 1: Write db.go**

```go
// routeguard-api/internal/db/db.go
package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 25
	cfg.MinConns = 5
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return pool, nil
}
```

**Step 2: Write migrate.go**

```go
// routeguard-api/internal/db/migrate.go
package db

import (
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func RunMigrations(databaseURL, migrationsPath string) error {
	m, err := migrate.New("file://"+migrationsPath, databaseURL)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
```

**Step 3: Wire into main.go** — call `db.Connect` and `db.RunMigrations` at startup before starting the HTTP server. Store pool in `Server` struct.

**Step 4: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add PostgreSQL connection pool and migration runner"
```

---

### Task 6: Full database schema migrations

**Files:**
- Create: `routeguard-api/migrations/001_initial_schema.up.sql`
- Create: `routeguard-api/migrations/001_initial_schema.down.sql`

**Step 1: Write 001_initial_schema.up.sql**

```sql
-- Tenant & Auth
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL DEFAULT 'district' CHECK (type IN ('district','company')),
  logo_url    TEXT,
  timezone    TEXT NOT NULL DEFAULT 'America/New_York',
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES organizations(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  avatar_url   TEXT,
  last_login_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

CREATE TABLE user_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('password','oidc','saml')),
  provider_user_id TEXT,
  password_hash    TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sso_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('oidc','saml')),
  display_name        TEXT NOT NULL,
  domain              TEXT NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  oidc_issuer_url     TEXT,
  oidc_client_id      TEXT,
  oidc_client_secret  TEXT, -- encrypted at application layer
  oidc_scopes         TEXT NOT NULL DEFAULT 'openid email profile',
  saml_entity_id      TEXT,
  saml_sso_url        TEXT,
  saml_certificate    TEXT, -- encrypted at application layer
  saml_metadata_url   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RBAC
CREATE TABLE org_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE TABLE user_roles (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  UNIQUE (user_id, role_id)
);

CREATE TABLE sso_role_mappings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sso_connection_id UUID NOT NULL REFERENCES sso_connections(id) ON DELETE CASCADE,
  claim_key         TEXT NOT NULL,
  claim_value       TEXT NOT NULL,
  org_role_id       UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE
);

-- Devices
CREATE TABLE devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serial            TEXT NOT NULL UNIQUE,
  device_token_hash TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'unprovisioned'
                      CHECK (status IN ('unprovisioned','provisioned','active','revoked')),
  vehicle_id        UUID, -- FK added after vehicles table
  seat_count        INTEGER,
  bus_layout        JSONB,
  provisioned_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core Entities
CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  phone         TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE students (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id),
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  student_number TEXT,
  grade          TEXT,
  rfid_tag_id    TEXT, -- encrypted
  address        TEXT,
  city           TEXT,
  state          TEXT,
  zip            TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','graduated')),
  medical_notes  TEXT, -- encrypted
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guardians (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  phone      TEXT NOT NULL, -- encrypted
  alt_phone  TEXT,          -- encrypted
  email      TEXT,
  sms_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  language   TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_guardians (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id  UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'parent' CHECK (relationship IN ('parent','guardian','emergency')),
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (student_id, guardian_id)
);

-- Fleet
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  number        TEXT,
  capacity      INTEGER,
  year          INTEGER,
  make          TEXT,
  model         TEXT,
  vin           TEXT,
  license_plate TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','retired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE devices ADD CONSTRAINT devices_vehicle_id_fk
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

CREATE TABLE drivers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  phone            TEXT,
  license_number   TEXT,   -- encrypted
  license_expiry   DATE,
  pin_hash         TEXT,   -- argon2id
  rfid_badge_id    TEXT,   -- encrypted
  rfid_badge_id_hash TEXT, -- sha-256 for fast lookup
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Routes & Stops
CREATE TABLE routes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'morning'
                          CHECK (type IN ('morning','afternoon','field_trip','activity')),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  description           TEXT,
  estimated_duration_min INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  address        TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  sequence_order INTEGER NOT NULL,
  scheduled_time TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stop_id        UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  route_id       UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  effective_date DATE,
  end_date       DATE
);

CREATE TABLE route_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      UUID NOT NULL REFERENCES routes(id),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id),
  driver_id     UUID NOT NULL REFERENCES drivers(id),
  effective_date DATE,
  end_date      DATE,
  days_of_week  TEXT NOT NULL DEFAULT 'MTWRF',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live Operations
CREATE TABLE trips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_assignment_id UUID NOT NULL REFERENCES route_assignments(id),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  date                DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trip_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  speed       DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_locations_trip_id ON trip_locations(trip_id);

CREATE TABLE scan_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id),
  student_id  UUID REFERENCES students(id),
  stop_id     UUID REFERENCES stops(id),
  rfid_tag_id TEXT NOT NULL,
  scan_type   TEXT NOT NULL CHECK (scan_type IN ('board','exit')),
  authorized  BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sms_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id  UUID NOT NULL REFERENCES guardians(id),
  trip_id      UUID REFERENCES trips(id),
  student_id   UUID REFERENCES students(id),
  message_type TEXT NOT NULL CHECK (message_type IN ('eta','board','exit','alert')),
  message_body TEXT NOT NULL,
  twilio_sid   TEXT,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reporting
CREATE TABLE daily_summaries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  route_id       UUID NOT NULL REFERENCES routes(id),
  date           DATE NOT NULL,
  total_students INTEGER NOT NULL DEFAULT 0,
  boarded_count  INTEGER NOT NULL DEFAULT 0,
  on_time        BOOLEAN NOT NULL DEFAULT TRUE,
  delay_minutes  INTEGER DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, route_id, date)
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('user','device','system')),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_org ON audit_logs((metadata->>'org_id'));
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

**Step 2: Write down migration**

```sql
-- routeguard-api/migrations/001_initial_schema.down.sql
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS daily_summaries CASCADE;
DROP TABLE IF EXISTS sms_messages CASCADE;
DROP TABLE IF EXISTS scan_events CASCADE;
DROP TABLE IF EXISTS trip_locations CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS route_assignments CASCADE;
DROP TABLE IF EXISTS student_stops CASCADE;
DROP TABLE IF EXISTS stops CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS student_guardians CASCADE;
DROP TABLE IF EXISTS guardians CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS schools CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS sso_role_mappings CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS org_roles CASCADE;
DROP TABLE IF EXISTS sso_connections CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS user_identities CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
```

**Step 3: Commit**

```bash
git add routeguard-api/migrations/
git commit -m "feat: add initial PostgreSQL schema migration"
```

---

### Task 7: Redis client + domain types

**Files:**
- Create: `routeguard-api/internal/cache/cache.go`
- Create: `routeguard-api/internal/domain/types.go`

**Step 1: Write cache.go**

```go
// routeguard-api/internal/cache/cache.go
package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct {
	client *redis.Client
}

func New(addr, password string) *Cache {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	})
	return &Cache{client: client}
}

func (c *Cache) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, data, ttl).Err()
}

func (c *Cache) Get(ctx context.Context, key string, dest any) error {
	data, err := c.client.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}

func (c *Cache) Del(ctx context.Context, keys ...string) error {
	return c.client.Del(ctx, keys...).Err()
}

func (c *Cache) Publish(ctx context.Context, channel string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.client.Publish(ctx, channel, data).Err()
}

func (c *Cache) Subscribe(ctx context.Context, channels ...string) *redis.PubSub {
	return c.client.Subscribe(ctx, channels...)
}

func (c *Cache) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

// IsNotFound returns true if the error is a cache miss
func IsNotFound(err error) bool {
	return err == redis.Nil
}
```

**Step 2: Write domain types** — define Go structs matching every DB table. Use `pgx` scan tags.

**Step 3: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add Redis cache client and domain types"
```

---

## Phase 3: Crypto & Auth Utilities

### Task 8: Encryption utilities

**Files:**
- Create: `routeguard-api/internal/crypto/encrypt.go`
- Create: `routeguard-api/internal/crypto/encrypt_test.go`

**Step 1: Write failing test**

```go
// routeguard-api/internal/crypto/encrypt_test.go
package crypto_test

import (
	"testing"
	"github.com/routeguard/api/internal/crypto"
)

func TestEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	for i := range key { key[i] = byte(i) }

	plaintext := "sensitive data: +1 (555) 867-5309"

	ciphertext, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	if ciphertext == plaintext {
		t.Fatal("ciphertext should not equal plaintext")
	}

	decrypted, err := crypto.Decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}

	if decrypted != plaintext {
		t.Fatalf("got %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptEmptyString(t *testing.T) {
	key := make([]byte, 32)
	result, err := crypto.Encrypt(key, "")
	if err != nil {
		t.Fatal(err)
	}
	if result != "" {
		t.Fatal("empty input should return empty output")
	}
}
```

**Step 2: Run test to verify it fails**

```bash
cd routeguard-api
go test ./internal/crypto/... -v
```

Expected: FAIL — package not found

**Step 3: Write encrypt.go**

```go
// routeguard-api/internal/crypto/encrypt.go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

// Encrypt encrypts plaintext using AES-256-GCM.
// Returns base64(nonce + ciphertext). Returns "" for empty input.
func Encrypt(key []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt decrypts a value produced by Encrypt.
func Decrypt(key []byte, ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, data := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, data, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
```

**Step 4: Run test to verify it passes**

```bash
go test ./internal/crypto/... -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add routeguard-api/internal/crypto/
git commit -m "feat: add AES-256-GCM encryption utilities"
```

---

### Task 9: Password hashing (bcrypt + Argon2id)

**Files:**
- Create: `routeguard-api/internal/crypto/password.go`
- Create: `routeguard-api/internal/crypto/password_test.go`

**Step 1: Write failing tests**

```go
func TestBcryptHashAndVerify(t *testing.T) {
	hash, err := crypto.HashPassword("correct-horse-battery-staple")
	if err != nil { t.Fatal(err) }

	if crypto.CheckPassword("correct-horse-battery-staple", hash) != nil {
		t.Fatal("correct password should verify")
	}
	if crypto.CheckPassword("wrong-password", hash) == nil {
		t.Fatal("wrong password should fail")
	}
}

func TestArgon2HashAndVerify(t *testing.T) {
	hash, err := crypto.HashPIN("1234")
	if err != nil { t.Fatal(err) }

	if crypto.CheckPIN("1234", hash) != nil {
		t.Fatal("correct PIN should verify")
	}
	if crypto.CheckPIN("9999", hash) == nil {
		t.Fatal("wrong PIN should fail")
	}
}
```

**Step 2: Run to verify failure, then implement**

```go
// routeguard-api/internal/crypto/password.go
package crypto

import (
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/argon2"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"
)

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(b), err
}

func CheckPassword(password, hash string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// HashPIN hashes a PIN with Argon2id. Format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
func HashPIN(pin string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(pin), salt, 3, 64*1024, 4, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func CheckPIN(pin, encoded string) error {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return fmt.Errorf("invalid hash format")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return err
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return err
	}
	actual := argon2.IDKey([]byte(pin), salt, 3, 64*1024, 4, 32)
	if subtle.ConstantTimeCompare(actual, expected) != 1 {
		return fmt.Errorf("invalid PIN")
	}
	return nil
}
```

**Step 3: Run tests, verify pass, commit**

```bash
go test ./internal/crypto/... -v
git add routeguard-api/internal/crypto/
git commit -m "feat: add bcrypt password and argon2id PIN hashing"
```

---

### Task 10: Session management (Redis)

**Files:**
- Create: `routeguard-api/internal/auth/session.go`
- Create: `routeguard-api/internal/auth/session_test.go`

**Step 1: Write session.go**

```go
// routeguard-api/internal/auth/session.go
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/routeguard/api/internal/cache"
)

const (
	SessionCookieName = "rg_session"
	SessionTTL        = 7 * 24 * time.Hour
	sessionKeyPrefix  = "session:"
)

type SessionPayload struct {
	UserID    string   `json:"user_id"`
	OrgID     string   `json:"org_id,omitempty"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	IsStaff   bool     `json:"is_staff"`
	Roles     []string `json:"roles,omitempty"`
	CreatedAt int64    `json:"created_at"`
}

func CreateSession(ctx context.Context, c *cache.Cache, payload SessionPayload) (string, error) {
	token := generateToken()
	payload.CreatedAt = time.Now().Unix()
	return token, c.Set(ctx, sessionKeyPrefix+token, payload, SessionTTL)
}

func GetSession(ctx context.Context, c *cache.Cache, token string) (*SessionPayload, error) {
	var payload SessionPayload
	err := c.Get(ctx, sessionKeyPrefix+token, &payload)
	if err != nil {
		return nil, err
	}
	return &payload, nil
}

func DestroySession(ctx context.Context, c *cache.Cache, token string) error {
	return c.Del(ctx, sessionKeyPrefix+token)
}

func TokenFromRequest(r *http.Request) string {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func SetSessionCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		Domain:   ".route-guard.com",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionTTL.Seconds()),
	})
}

func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:   SessionCookieName,
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
```

**Step 2: Write response helpers**

```go
// routeguard-api/internal/api/respond.go
package api

import (
	"encoding/json"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/auth/ routeguard-api/internal/api/
git commit -m "feat: add Redis session management and response helpers"
```

---

### Task 11: Auth middleware (session validation + RBAC)

**Files:**
- Create: `routeguard-api/internal/middleware/auth.go`
- Create: `routeguard-api/internal/middleware/rbac.go`

**Step 1: Write auth.go**

```go
// routeguard-api/internal/middleware/auth.go
package middleware

import (
	"context"
	"net/http"

	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/cache"
)

type contextKey string

const SessionKey contextKey = "session"

func Authenticate(c *cache.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.TokenFromRequest(r)
			if token == "" {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			session, err := auth.GetSession(r.Context(), c, token)
			if err != nil || session == nil {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), SessionKey, session)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func SessionFromContext(ctx context.Context) *auth.SessionPayload {
	s, _ := ctx.Value(SessionKey).(*auth.SessionPayload)
	return s
}
```

**Step 2: Write rbac.go**

```go
// routeguard-api/internal/middleware/rbac.go
package middleware

import (
	"net/http"

	"github.com/routeguard/api/internal/api"
)

// RequireStaff requires the session user to be a staff (super_admin) user.
func RequireStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session := SessionFromContext(r.Context())
		if session == nil || !session.IsStaff {
			api.Error(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission checks that the session user has a given permission in their roles.
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := SessionFromContext(r.Context())
			if session == nil {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			for _, p := range session.Roles {
				if p == permission {
					next.ServeHTTP(w, r)
					return
				}
			}
			api.Error(w, http.StatusForbidden, "forbidden")
		})
	}
}
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/middleware/
git commit -m "feat: add auth and RBAC middleware"
```

---

### Task 12: Staff + org email/password login handlers

**Files:**
- Create: `routeguard-api/internal/api/auth_handler.go`
- Create: `routeguard-api/internal/repository/user_repo.go`

**Step 1: Write user repository**

```go
// routeguard-api/internal/repository/user_repo.go
package repository

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type UserRepo struct{ pool *pgxpool.Pool }

func NewUserRepo(pool *pgxpool.Pool) *UserRepo { return &UserRepo{pool} }

func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	// SELECT users.*, user_identities.password_hash
	// FROM users JOIN user_identities ON ...
	// WHERE users.email = $1 AND user_identities.provider = 'password'
}

func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) { ... }

func (r *UserRepo) GetUserRoles(ctx context.Context, userID string) ([]string, error) {
	// Returns flat permission list from joined org_roles
}
```

**Step 2: Write auth handler**

```go
// routeguard-api/internal/api/auth_handler.go
package api

// POST /auth/login
// Body: { "email": "...", "password": "..." }
// Validates credentials, creates session, sets cookie
// Staff users: IsStaff=true, no OrgID check
// Org users: IsStaff=false, must have OrgID
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) { ... }

// POST /auth/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) { ... }

// GET /auth/me
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) { ... }
```

**Step 3: Register routes in server.go**

```go
r.Post("/auth/login", h.Login)
r.Post("/auth/logout", h.Logout)
r.With(middleware.Authenticate(cache)).Get("/auth/me", h.Me)
```

**Step 4: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add email/password login and logout handlers"
```

---

### Task 13: OIDC flow (init + callback)

**Files:**
- Create: `routeguard-api/internal/auth/oidc.go`

**Step 1: Write oidc.go**

```go
// routeguard-api/internal/auth/oidc.go
package auth

// OIDCInit generates the authorization URL, stores state+verifier in Redis, redirects.
// GET /auth/sso/:slug/init?connection_id=...
func OIDCInit(...) { ... }

// OIDCCallback exchanges code, fetches user info, upserts user, syncs roles,
// creates session, sets cookie, redirects to /dashboard.
// GET /auth/sso/callback?code=...&state=...
func OIDCCallback(...) { ... }
```

Key implementation details:
- Use `coreos/go-oidc` for provider discovery and token verification
- Store `OAuthState{state, codeVerifier, connectionID, redirectAfter}` in Redis with 10-minute TTL
- On callback: fetch user info, call `syncSSOUserRoles()` to apply `sso_role_mappings`
- On unknown user: auto-provision user record in `users` + `user_identities`

**Step 2: Commit**

```bash
git add routeguard-api/internal/auth/
git commit -m "feat: add OIDC authorization code + PKCE flow"
```

---

### Task 14: SAML flow (init + ACS + metadata)

**Files:**
- Create: `routeguard-api/internal/auth/saml.go`

**Step 1: Implement using `crewjam/saml`**

Key points:
- `GET /auth/sso/saml/metadata` — serves SP metadata XML using `crewjam/saml` service provider
- `GET /auth/sso/:slug/init` with `type=saml` — initiates IdP-redirect with signed AuthnRequest
- `POST /auth/sso/saml/acs` — validates assertion, extracts attributes, upserts user, syncs roles, creates session

**Step 2: Commit**

```bash
git add routeguard-api/internal/auth/
git commit -m "feat: add SAML 2.0 SP-initiated flow and ACS endpoint"
```

---

### Task 15: Device provisioning + driver PIN/RFID auth

**Files:**
- Create: `routeguard-api/internal/api/device_auth_handler.go`
- Create: `routeguard-api/internal/repository/device_repo.go`
- Create: `routeguard-api/internal/repository/driver_repo.go`

**Step 1: Write device provisioning**

```go
// POST /api/v1/devices/provision
// Body: { "provisioning_token": "..." }
// 1. Validate one-time token from Redis (delete immediately on use)
// 2. Create device record with hashed long-lived device credential
// 3. Return device credential (shown once, never stored plain)
func (h *Handler) ProvisionDevice(w http.ResponseWriter, r *http.Request) { ... }

// POST /api/v1/devices/heartbeat
// Device credential auth. Updates device last_seen in Redis.
func (h *Handler) DeviceHeartbeat(w http.ResponseWriter, r *http.Request) { ... }
```

**Step 2: Write driver PIN + RFID auth**

```go
// POST /api/v1/auth/pin
// Body: { "pin": "1234" }
// Device credential required. Looks up driver WHERE org_id = device.org_id.
// Returns short-lived trip session token.
func (h *Handler) DriverPINAuth(w http.ResponseWriter, r *http.Request) { ... }

// POST /api/v1/auth/rfid
// Body: { "rfid_badge_id": "..." }
// Looks up by rfid_badge_id_hash WHERE org_id = device.org_id.
func (h *Handler) DriverRFIDAuth(w http.ResponseWriter, r *http.Request) { ... }
```

**Step 3: Write device credential middleware**

```go
// middleware/device_auth.go
// Reads Authorization: Bearer <device-token> header
// Validates hash against devices table (cache-first via Redis)
// Attaches device context to request
```

**Step 4: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add device provisioning and driver PIN/RFID authentication"
```

---

## Phase 4: Core Go API — Admin Handlers

### Task 16: Organization CRUD

**Files:**
- Create: `routeguard-api/internal/api/org_handler.go`
- Create: `routeguard-api/internal/repository/org_repo.go`

**Step 1: Implement repository**

```go
type OrgRepo struct{ pool *pgxpool.Pool }

func (r *OrgRepo) List(ctx context.Context) ([]domain.Organization, error)
func (r *OrgRepo) Get(ctx context.Context, id string) (*domain.Organization, error)
func (r *OrgRepo) Create(ctx context.Context, org domain.NewOrganization) (*domain.Organization, error)
func (r *OrgRepo) Update(ctx context.Context, id string, patch domain.OrgPatch) (*domain.Organization, error)
func (r *OrgRepo) Delete(ctx context.Context, id string) error
// SeedSystemRoles creates org_admin, school_admin, driver roles for new org
func (r *OrgRepo) SeedSystemRoles(ctx context.Context, orgID string) error
```

**Step 2: Implement handlers** — standard CRUD. All behind `Authenticate` + `RequireStaff`. Call `SeedSystemRoles` on create.

**Step 3: Register routes**

```go
r.Route("/admin", func(r chi.Router) {
    r.Use(middleware.Authenticate(cache))
    r.Use(middleware.RequireStaff)
    r.Get("/organizations", h.ListOrgs)
    r.Post("/organizations", h.CreateOrg)
    r.Get("/organizations/{id}", h.GetOrg)
    r.Patch("/organizations/{id}", h.UpdateOrg)
    r.Delete("/organizations/{id}", h.DeleteOrg)
})
```

**Step 4: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add organization CRUD admin endpoints"
```

---

### Task 17: SSO connections CRUD

**Files:**
- Create: `routeguard-api/internal/api/sso_handler.go`
- Create: `routeguard-api/internal/repository/sso_repo.go`

**Step 1: Key implementation detail** — encrypt `oidc_client_secret` and `saml_certificate` using `crypto.Encrypt(cfg.DataEncryptionKey, ...)` before writing to Postgres. Decrypt when reading.

**Step 2: Endpoints**

```
GET    /admin/organizations/:id/sso
POST   /admin/organizations/:id/sso
PATCH  /admin/organizations/:id/sso/:connectionId
DELETE /admin/organizations/:id/sso/:connectionId
```

Also expose for org admins:
```
GET    /dashboard/settings/sso
POST   /dashboard/settings/sso
PATCH  /dashboard/settings/sso/:id
DELETE /dashboard/settings/sso/:id
```

**Step 3: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add SSO connection CRUD with field encryption"
```

---

### Task 18: Devices CRUD + provisioning token generation

**Files:**
- Create: `routeguard-api/internal/api/admin_device_handler.go`

**Step 1: Provisioning token flow**

```go
// POST /admin/devices — create device record + generate one-time provisioning token
// 1. Insert device (status=unprovisioned) with a random serial
// 2. Generate cryptographically random provisioning token
// 3. Store token in Redis: "provision_token:{token}" → device_id, TTL 72h
// 4. Return { device_id, serial, provisioning_token, expires_at }
//    — token is returned once only, never stored plain

// PATCH /admin/devices/:id — update metadata (serial, notes)
// DELETE /admin/devices/:id — sets status=revoked, blacklists in Redis
```

**Step 2: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add device admin CRUD and provisioning token generation"
```

---

### Task 19: Audit log middleware + endpoint

**Files:**
- Create: `routeguard-api/internal/middleware/audit.go`
- Create: `routeguard-api/internal/api/audit_handler.go`
- Create: `routeguard-api/internal/repository/audit_repo.go`

**Step 1: Write audit logger**

```go
// AuditLog writes an audit_logs record. Called from handlers, not middleware,
// to have access to the operation result and target ID.
func AuditLog(ctx context.Context, pool *pgxpool.Pool, entry AuditEntry) {
    // Non-blocking: run in goroutine. Failures logged but don't affect response.
    go func() {
        _, _ = pool.Exec(ctx,
            `INSERT INTO audit_logs (actor_id, actor_type, action, target_type, target_id, metadata, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            entry.ActorID, entry.ActorType, entry.Action, entry.TargetType, entry.TargetID,
            entry.Metadata, entry.IPAddress,
        )
    }()
}
```

**Step 2: GET /admin/audit-logs** — paginated, filterable by org (from metadata), actor, action, date range.

**Step 3: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add audit logging and admin audit-logs endpoint"
```

---

## Phase 5: Core Go API — Dashboard Handlers

### Task 20: Schools CRUD

**Files:**
- Create: `routeguard-api/internal/api/school_handler.go`
- Create: `routeguard-api/internal/repository/school_repo.go`

**Pattern for all dashboard resources:**
- All queries include `WHERE org_id = $1` using the session's OrgID
- `RequirePermission("schools:read")` on GET, `RequirePermission("schools:write")` on POST/PATCH/DELETE
- Standard CRUD: List (paginated), Get, Create, Update, Delete

```
GET    /dashboard/schools
POST   /dashboard/schools
GET    /dashboard/schools/:id
PATCH  /dashboard/schools/:id
DELETE /dashboard/schools/:id
```

**Commit:** `feat: add schools CRUD dashboard endpoints`

---

### Task 21: Students CRUD + bulk import

**Files:**
- Create: `routeguard-api/internal/api/student_handler.go`
- Create: `routeguard-api/internal/repository/student_repo.go`

Key details:
- `rfid_tag_id` encrypted on write, decrypted on read
- `medical_notes` encrypted on write, decrypted on read
- Bulk import: `POST /dashboard/students/import` accepts CSV, processes row-by-row, returns `{imported, errors}`

**Commit:** `feat: add students CRUD and CSV bulk import`

---

### Task 22: Guardians CRUD

- `phone` and `alt_phone` encrypted on write, decrypted on read
- Linked to students via `student_guardians`
- `GET/POST /dashboard/students/:id/guardians`

**Commit:** `feat: add guardians CRUD with phone encryption`

---

### Task 23: Drivers CRUD

- `license_number` encrypted, `rfid_badge_id` encrypted, `rfid_badge_id_hash` computed on write
- `pin_hash` set via dedicated `POST /dashboard/drivers/:id/set-pin` endpoint (not via PATCH to avoid accidental exposure)

**Commit:** `feat: add drivers CRUD with PIN management`

---

### Task 24: Vehicles CRUD

Standard CRUD, no encrypted fields. `GET/POST/PATCH/DELETE /dashboard/vehicles`

**Commit:** `feat: add vehicles CRUD`

---

### Task 25: Routes + Stops CRUD

```
GET/POST /dashboard/routes
GET/PATCH/DELETE /dashboard/routes/:id
GET/POST /dashboard/routes/:id/stops
PATCH/DELETE /dashboard/routes/:id/stops/:stopId
GET/POST /dashboard/routes/:id/assignments
GET /dashboard/routes/:id/students
```

**Commit:** `feat: add routes, stops, and route assignments CRUD`

---

### Task 26: Trips CRUD

```
GET/POST /dashboard/trips
GET /dashboard/trips/:id
PATCH /dashboard/trips/:id (cancel, add notes)
```

**Commit:** `feat: add trips dashboard endpoints`

---

### Task 27: Settings (users, API keys, roles)

**Users:**
- `GET/POST /dashboard/settings/users` — invite user (creates user + identity records, sends invite email or returns invite link)
- `PATCH/DELETE /dashboard/settings/users/:id`

**API keys:**
- `GET/POST /dashboard/settings/api-keys`
- `DELETE /dashboard/settings/api-keys/:id`
- On create: generate random key, return raw value once, store hash

**Custom roles:**
- `GET/POST /dashboard/settings/roles`
- `PATCH/DELETE /dashboard/settings/roles/:id`
- `is_system=true` roles: return them but reject mutations
- `GET/POST/DELETE /dashboard/settings/roles/:id/sso-mappings`

**Commit:** `feat: add settings endpoints for users, API keys, and custom roles`

---

### Task 28: Reports endpoints

```
GET /dashboard/reports/attendance?date_from=&date_to=&route_id=
GET /dashboard/reports/ridership?...
GET /dashboard/reports/performance?...
GET /dashboard/reports/export?type=attendance&format=csv&...
```

Each report queries across `trips`, `scan_events`, `daily_summaries` scoped to `org_id`. Export returns CSV with `Content-Disposition: attachment`.

**Commit:** `feat: add attendance, ridership, performance, and export report endpoints`

---

## Phase 6: Real-time (GPS + Scanning)

### Task 29: Trip lifecycle + GPS ingestion (device API)

**Files:**
- Create: `routeguard-api/internal/api/trip_device_handler.go`

**Step 1: Write POST /api/v1/trips/start**

```go
func (h *Handler) StartTrip(w http.ResponseWriter, r *http.Request) {
    device := DeviceFromContext(r.Context())
    // 1. Find today's route_assignment for device.DriverID + device.VehicleID
    // 2. Create trip record (status=in_progress, started_at=now)
    // 3. Load route manifest: stops + students per stop
    // 4. Cache manifest in Redis: "trip:manifest:{trip_id}" TTL=12h
    // 5. Return { trip, route, stops: [{...students}], vehicle, driver }
}
```

**Step 2: Write POST /api/v1/trips/:id/location**

```go
func (h *Handler) RecordLocation(w http.ResponseWriter, r *http.Request) {
    // 1. Insert into trip_locations
    // 2. Publish to Redis channel "trip:location:{trip_id}":
    //    { trip_id, lat, lng, speed, heading, recorded_at }
    // 3. Return 204
}
```

**Step 3: Write POST /api/v1/trips/:id/end**

```go
func (h *Handler) EndTrip(w http.ResponseWriter, r *http.Request) {
    // 1. Update trip status=completed, completed_at=now
    // 2. Delete manifest from Redis cache
    // 3. Compute daily_summary and upsert
    // 4. Return trip summary
}
```

**Step 4: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add device trip lifecycle and GPS location endpoints"
```

---

### Task 30: RFID scan endpoint + SMS trigger

**Files:**
- Create: `routeguard-api/internal/api/scan_handler.go`
- Create: `routeguard-api/internal/notifications/sms.go`

**Step 1: Write POST /api/v1/trips/:id/scan**

```go
func (h *Handler) RecordScan(w http.ResponseWriter, r *http.Request) {
    // Body: { rfid_tag_id, scan_type: "board"|"exit", stop_id? }
    // 1. Look up student by rfid_badge_id_hash WHERE org_id = device.org_id
    // 2. Record scan_event (authorized = student found)
    // 3. Publish to Redis "trip:scan:{trip_id}": { student_id, name, scan_type, stop_id, authorized }
    // 4. If authorized + sms_opt_in guardians: send SMS async (goroutine)
    // 5. If not authorized: publish to "trip:alert:{org_id}"
    // 6. Return { authorized, student? }
}
```

**Step 2: Write notifications/sms.go**

```go
package notifications

type TwilioClient struct {
    accountSID, authToken, fromNumber string
}

func (c *TwilioClient) Send(ctx context.Context, to, body string) (string, error) {
    // POST to https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
}

func BoardMessage(studentName string) string {
    return fmt.Sprintf("RouteGuard: %s has boarded the school bus.", studentName)
}

func ExitMessage(studentName string) string {
    return fmt.Sprintf("RouteGuard: %s has exited the school bus.", studentName)
}
```

**Step 3: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add RFID scan endpoint with SMS notification trigger"
```

---

### Task 31: SSE streaming endpoint

**Files:**
- Create: `routeguard-api/internal/stream/sse.go`
- Create: `routeguard-api/internal/api/stream_handler.go`

**Step 1: Write sse.go**

```go
// routeguard-api/internal/stream/sse.go
package stream

// Writer wraps http.ResponseWriter for SSE
type Writer struct {
    w       http.ResponseWriter
    flusher http.Flusher
}

func NewWriter(w http.ResponseWriter) (*Writer, bool) {
    flusher, ok := w.(http.Flusher)
    if !ok {
        return nil, false
    }
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    w.Header().Set("X-Accel-Buffering", "no") // Disable Nginx/Traefik buffering
    return &Writer{w: w, flusher: flusher}, true
}

func (s *Writer) Send(event string, data any) error {
    b, err := json.Marshal(data)
    if err != nil {
        return err
    }
    fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, b)
    s.flusher.Flush()
    return nil
}
```

**Step 2: Write stream handler**

```go
// GET /stream/trips
// 1. Auth via session cookie (org-scoped)
// 2. Find all active trip IDs for this org
// 3. Subscribe to Redis channels: "trip:location:{id}", "trip:scan:{id}", "trip:alert:{org_id}"
// 4. Loop: receive from pubsub, forward as SSE events, detect client disconnect via ctx.Done()
func (h *Handler) StreamTrips(w http.ResponseWriter, r *http.Request) { ... }
```

**Step 3: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add SSE streaming endpoint for real-time trip events"
```

---

### Task 32: Twilio webhook + rate limiting middleware

**Files:**
- Create: `routeguard-api/internal/api/webhook_handler.go`
- Create: `routeguard-api/internal/middleware/rate_limit.go`

**Step 1: Twilio webhook**

```go
// POST /webhooks/twilio/status
// Validates Twilio signature, updates sms_messages.status
```

**Step 2: Rate limiting**

```go
// Uses Redis INCR + EXPIRE pattern
// Applied to: /auth/login, /api/v1/devices/provision, /api/v1/auth/pin, /api/v1/auth/rfid
// Key: "rate:{ip}:{endpoint}", limit per minute configurable
```

**Step 3: Commit**

```bash
git add routeguard-api/
git commit -m "feat: add Twilio webhook handler and Redis rate limiting"
```

---

### Task 33: Go API Dockerfile

**Files:**
- Create: `routeguard-api/Dockerfile`

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./cmd/api

FROM gcr.io/distroless/static-debian12
COPY --from=builder /api /api
COPY --from=builder /app/migrations /migrations
EXPOSE 8080
ENTRYPOINT ["/api"]
```

**Commit:** `feat: add Go API Dockerfile`

---

## Phase 7: Next.js Dashboard

### Task 34: Initialize Next.js project

**Files:**
- Create: `dashboard/` — fresh Next.js project

**Step 1: Scaffold**

```bash
cd B:/.dev/RouteGuard
npx create-next-app@latest dashboard \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*"
```

**Step 2: Install dependencies**

```bash
cd dashboard
npm install mapbox-gl @types/mapbox-gl
npm install react-hook-form @hookform/resolvers zod
npm install sonner next-themes
npm install lucide-react
npm install date-fns
npm install swr
npx shadcn@latest init
```

**Step 3: Remove default Next.js boilerplate** — clear `app/page.tsx`, `app/globals.css` (keep reset), `public/`

**Step 4: Commit**

```bash
git add dashboard/
git commit -m "feat: initialize Next.js dashboard project"
```

---

### Task 35: Design tokens + global styles

**Files:**
- Modify: `dashboard/app/globals.css`
- Create: `dashboard/lib/utils.ts`

**Step 1: Write globals.css with brand tokens**

```css
@import "tailwindcss";

:root {
  --color-navy: #1B3A5C;
  --color-navy-dark: #122840;
  --color-navy-light: #254d7a;
  --color-amber: #F5A825;
  --color-amber-dark: #d4911a;
  --color-green: #2A7D4F;
  --color-green-light: #3aad6d;
  --color-slate: #F1F4F8;
  --color-slate-dark: #E2E8F0;
  --color-white: #FFFFFF;

  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

body {
  font-family: var(--font-sans);
  background: var(--color-slate);
  color: #1a1a2e;
}
```

**Step 2: Configure Tailwind to use custom colors in `tailwind.config.ts`**

**Step 3: Commit**

```bash
git add dashboard/
git commit -m "feat: add brand design tokens and global styles"
```

---

### Task 36: Typed API client

**Files:**
- Create: `dashboard/lib/api.ts`

**Step 1: Write api.ts**

```typescript
// dashboard/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include', // send rg_session cookie
    headers: {
      'Content-Type': 'application/json',
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

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request<User>('/auth/me'),
  },
  organizations: {
    list: () => request<Organization[]>('/admin/organizations'),
    get: (id: string) => request<Organization>(`/admin/organizations/${id}`),
    create: (data: NewOrganization) =>
      request<Organization>('/admin/organizations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Organization>) =>
      request<Organization>(`/admin/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/admin/organizations/${id}`, { method: 'DELETE' }),
  },
  // ... add all other resources following the same pattern
}

// Type exports matching Go domain types
export interface User { id: string; orgId: string; email: string; name: string; ... }
export interface Organization { id: string; name: string; slug: string; ... }
// ... all other types
```

**Step 2: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add typed Go API client for Next.js"
```

---

### Task 37: Root layout + fonts

**Files:**
- Modify: `dashboard/app/layout.tsx`

**Step 1: Write root layout**

```tsx
// dashboard/app/layout.tsx
import { Inter } from 'next/font/google'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

**Step 2: Copy brand assets to public/**

```bash
cp "C:/Users/Owner/Downloads/Route Guard Assets v1/"*.png dashboard/public/assets/
```

**Step 3: Commit**

```bash
git add dashboard/
git commit -m "feat: add root layout with Inter/JetBrains Mono fonts and brand assets"
```

---

### Task 38: Marketing / public pages

**Files:**
- Create: `dashboard/app/(marketing)/layout.tsx`
- Create: `dashboard/app/(marketing)/page.tsx` — landing page
- Create: `dashboard/app/(marketing)/pricing/page.tsx`
- Create: `dashboard/app/(marketing)/contact/page.tsx`
- Create: `dashboard/app/privacy/page.tsx`
- Create: `dashboard/app/terms/page.tsx`
- Create: `dashboard/components/marketing/nav.tsx`
- Create: `dashboard/components/marketing/footer.tsx`

**Landing page sections:**
1. Hero — bold headline, RouteGuard logo, amber CTA button "Request a Demo"
2. Features — live GPS tracking, RFID scanning, guardian SMS, multi-org
3. How it works — 3-step: provision device → assign routes → track live
4. Trusted by — placeholder logos
5. CTA — "Get started" with contact form link

**Marketing nav:** Logo (text lockup) + nav links + "Staff Login" link (subtle, not prominent)

**Commit:** `feat: add public marketing pages`

---

### Task 39: Auth pages — staff login

**Files:**
- Create: `dashboard/app/staff/login/page.tsx`
- Create: `dashboard/components/auth/staff-login-form.tsx`

**Step 1: Write staff login form**

```tsx
// Client component — form with email + password
// On submit: calls api.auth.login(), on success: router.push('/admin')
// On error (401): shows "Invalid credentials"
// Design: centered card, RouteGuard logo, navy/amber theme
// No link to org login — this portal is not publicly discoverable
```

**Step 2: Commit**

```bash
git add dashboard/app/staff/ dashboard/components/auth/
git commit -m "feat: add staff login portal"
```

---

### Task 40: Auth pages — org login by slug

**Files:**
- Create: `dashboard/app/login/[slug]/page.tsx`
- Create: `dashboard/components/auth/org-login-form.tsx`
- Create: `dashboard/components/auth/sso-button.tsx`

**Step 1: Page server component**

```tsx
// Fetches org by slug from Go API (GET /auth/org/:slug/config)
// Returns: org name, logo, enabled auth methods
// Renders org-branded login page
```

**Step 2: Login form**

```tsx
// Shows enabled methods:
// - Email + password fields (if enabled)
// - SSO buttons per enabled connection: "Sign in with Google", "Sign in with Microsoft", etc.
// SSO button → redirects to /auth/sso/{slug}/init?connection_id=...
//   which Go API handles (init OIDC/SAML flow)
```

**Step 3: Commit**

```bash
git add dashboard/app/login/ dashboard/components/auth/
git commit -m "feat: add org login page with SSO provider buttons"
```

---

### Task 41: Super admin layout + sidebar

**Files:**
- Create: `dashboard/app/admin/layout.tsx`
- Create: `dashboard/components/admin/admin-sidebar.tsx`
- Create: `dashboard/components/admin/admin-header.tsx`

**Step 1: Admin layout**

```tsx
// Server component — fetches /auth/me, redirects to /staff/login if no session or !isStaff
// Renders: dark navy sidebar + content area
```

**Step 2: Admin sidebar**

```tsx
// Navy background (#1B3A5C), white text
// RouteGuard logo mark (collapsed) / text logo (expanded)
// Nav items: Organizations, Devices, Audit Logs, (Settings later)
// Active item: amber highlight
```

**Step 3: Commit**

```bash
git add dashboard/app/admin/ dashboard/components/admin/
git commit -m "feat: add super admin layout and navy sidebar"
```

---

### Task 42: Admin — Organizations pages

**Files:**
- Create: `dashboard/app/admin/organizations/page.tsx`
- Create: `dashboard/app/admin/organizations/new/page.tsx`
- Create: `dashboard/app/admin/organizations/[id]/page.tsx`
- Create: `dashboard/app/admin/organizations/[id]/edit/page.tsx`
- Create: `dashboard/components/admin/organization-form.tsx`
- Create: `dashboard/components/admin/sso-connection-form.tsx`
- Create: `dashboard/components/admin/sso-connections-card.tsx`
- Create: `dashboard/components/admin/org-table.tsx`

**Features:**
- Org table: name, slug, type, SSO status, created date, actions
- Create/edit form: name, slug (auto-generated, editable), type, timezone, logo upload
- Org detail: overview + SSO connections card
- SSO connections: list, add (OIDC or SAML config form), test connection, delete

**Commit:** `feat: add admin organizations and SSO connection management pages`

---

### Task 43: Admin — Devices pages

**Files:**
- Create: `dashboard/app/admin/devices/page.tsx`
- Create: `dashboard/app/admin/devices/new/page.tsx`
- Create: `dashboard/components/admin/device-table.tsx`
- Create: `dashboard/components/admin/provision-token-modal.tsx`

**Features:**
- Device table: serial, org, status badge, vehicle assigned, provisioned date
- "Create Device" → select org, generates provisioning token
- Token modal: shows token once with copy button and `provision.json` download, clear warning "This token will not be shown again"
- Revoke action with confirmation

**Commit:** `feat: add admin device management pages`

---

### Task 44: Dashboard layout + sidebar

**Files:**
- Create: `dashboard/app/dashboard/layout.tsx`
- Create: `dashboard/components/dashboard/app-sidebar.tsx`
- Create: `dashboard/components/dashboard/header.tsx`

**Step 1: Layout server component**

```tsx
// Fetches /auth/me — redirects to /login/{slug} if no session
// Passes user + org + permissions to sidebar
```

**Step 2: Sidebar**

```tsx
// Same navy design as admin sidebar
// Nav items gated by user permissions from session:
// Home, Routes, Students, Drivers, Vehicles, Schools, Trips, Reports, Settings
// Items hidden if user lacks read permission for that resource
```

**Step 3: Commit**

```bash
git add dashboard/app/dashboard/ dashboard/components/dashboard/
git commit -m "feat: add org dashboard layout and permission-gated sidebar"
```

---

### Task 45: Dashboard — data table component

**Files:**
- Create: `dashboard/components/dashboard/data-table.tsx`

Reusable table component used across all dashboard list pages:
- Column definitions, sorting, pagination, search input
- Row actions (edit, delete) with permission checks
- Empty state
- Loading skeleton

**Commit:** `feat: add reusable data table component`

---

### Task 46: Dashboard — Schools pages

```
dashboard/app/dashboard/schools/page.tsx
dashboard/app/dashboard/schools/new/page.tsx
dashboard/app/dashboard/schools/[id]/page.tsx
dashboard/app/dashboard/schools/[id]/edit/page.tsx
dashboard/components/dashboard/school-form.tsx
```

School form: name, address fields, lat/lng (auto-populated via Mapbox geocoder on address), phone, contact name/email.

**Commit:** `feat: add dashboard schools pages`

---

### Task 47: Dashboard — Students pages + import

```
dashboard/app/dashboard/students/page.tsx
dashboard/app/dashboard/students/new/page.tsx
dashboard/app/dashboard/students/[id]/page.tsx
dashboard/app/dashboard/students/[id]/edit/page.tsx
dashboard/app/dashboard/students/import/page.tsx
dashboard/components/dashboard/student-form.tsx
dashboard/components/dashboard/import-wizard.tsx
```

Import wizard: CSV upload → preview table with validation errors highlighted → confirm import → progress + results.

**Commit:** `feat: add dashboard students pages and CSV import wizard`

---

### Task 48: Dashboard — Drivers pages

```
dashboard/app/dashboard/drivers/page.tsx
dashboard/app/dashboard/drivers/new/page.tsx
dashboard/app/dashboard/drivers/[id]/page.tsx
dashboard/app/dashboard/drivers/[id]/edit/page.tsx
dashboard/components/dashboard/driver-form.tsx
```

Driver form: personal info, license number/expiry, status. Separate "Set PIN" modal (POST to `/dashboard/drivers/:id/set-pin`). RFID badge ID field.

**Commit:** `feat: add dashboard drivers pages with PIN management`

---

### Task 49: Dashboard — Vehicles pages

Standard CRUD pages for vehicles.

**Commit:** `feat: add dashboard vehicles pages`

---

### Task 50: Dashboard — Routes pages + route builder

```
dashboard/app/dashboard/routes/page.tsx
dashboard/app/dashboard/routes/new/page.tsx
dashboard/app/dashboard/routes/[id]/page.tsx
dashboard/app/dashboard/routes/[id]/edit/page.tsx
dashboard/components/dashboard/route-builder.tsx
dashboard/components/map/map-view.tsx
```

Route builder:
- Mapbox map panel + stop list panel (side by side)
- Add stop: type address → Mapbox geocoder → pin dropped on map
- Drag-to-reorder stops → updates sequence_order
- Assign students to stops via student search
- Save publishes route (status → active)

**Commit:** `feat: add dashboard routes pages and interactive route builder map`

---

### Task 51: Dashboard — Trips pages + live map

```
dashboard/app/dashboard/trips/page.tsx
dashboard/app/dashboard/trips/[id]/page.tsx
dashboard/components/dashboard/trip-detail-map.tsx
```

Trip detail page:
- Mapbox map showing route stops as markers
- Real-time bus position updating via SSE (see Task 56)
- Stop list with student scan status (board/exit badges)
- Trip info: driver, vehicle, started/completed time, status badge

**Commit:** `feat: add dashboard trips pages`

---

### Task 52: Dashboard — Reports pages

```
dashboard/app/dashboard/reports/page.tsx
dashboard/app/dashboard/reports/attendance/page.tsx
dashboard/app/dashboard/reports/ridership/page.tsx
dashboard/app/dashboard/reports/performance/page.tsx
dashboard/components/dashboard/report-filters.tsx
```

Each report page: date range picker + route/school filter → table of results → Export CSV button (calls `/dashboard/reports/export`).

**Commit:** `feat: add dashboard reports pages with export`

---

### Task 53: Dashboard — Settings pages

```
dashboard/app/dashboard/settings/page.tsx       (org settings)
dashboard/app/dashboard/settings/users/page.tsx
dashboard/app/dashboard/settings/api-keys/page.tsx
dashboard/app/dashboard/settings/sso/page.tsx
dashboard/app/dashboard/settings/roles/page.tsx
dashboard/components/dashboard/org-settings-form.tsx
dashboard/components/dashboard/users-management.tsx
dashboard/components/dashboard/api-keys-management.tsx
dashboard/components/dashboard/roles-management.tsx
```

Roles management:
- List system roles (read-only, shows permission badges) + custom roles
- Create/edit custom role: name + permission checkbox grid
- Per-role SSO mapping table: add claim_key → claim_value → role mapping

**Commit:** `feat: add dashboard settings pages including custom roles and SSO mapping`

---

## Phase 8: Real-time Dashboard Integration

### Task 54: SSE hook + live trip map

**Files:**
- Create: `dashboard/hooks/use-trip-stream.ts`
- Modify: `dashboard/components/dashboard/trip-detail-map.tsx`

**Step 1: Write SSE hook**

```typescript
// dashboard/hooks/use-trip-stream.ts
export function useTripStream(orgId: string) {
  const [locations, setLocations] = useState<Record<string, LocationEvent>>({})
  const [scans, setScans] = useState<ScanEvent[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])

  useEffect(() => {
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/stream/trips`,
      { withCredentials: true }
    )
    es.addEventListener('location', (e) => {
      const data = JSON.parse(e.data)
      setLocations(prev => ({ ...prev, [data.trip_id]: data }))
    })
    es.addEventListener('scan', (e) => {
      setScans(prev => [JSON.parse(e.data), ...prev].slice(0, 100))
    })
    es.addEventListener('alert', (e) => {
      setAlerts(prev => [JSON.parse(e.data), ...prev])
    })
    return () => es.close()
  }, [orgId])

  return { locations, scans, alerts }
}
```

**Step 2: Integrate into trip detail map** — pass `locations[tripId]` to a Mapbox marker that animates to new coordinates on update.

**Step 3: Commit**

```bash
git add dashboard/hooks/ dashboard/components/
git commit -m "feat: add SSE real-time hook and live GPS map integration"
```

---

### Task 55: Alert toast system

**Files:**
- Modify: `dashboard/components/dashboard/header.tsx`
- Create: `dashboard/components/dashboard/alert-panel.tsx`

Alerts from SSE stream appear as Sonner toasts + accumulate in a dismissible alert panel in the header (bell icon with count badge). Alert types: unauthorized scan (red), bus offline (orange), route deviation (yellow).

**Commit:** `feat: add real-time alert toast and panel in dashboard header`

---

## Phase 9: Driver PWA

### Task 56: PWA manifest + service worker

**Files:**
- Create: `dashboard/public/manifest.json`
- Create: `dashboard/app/driver/sw.ts` (service worker source)
- Modify: `dashboard/app/layout.tsx` (add manifest link)

**Step 1: Write manifest.json**

```json
{
  "name": "RouteGuard Driver",
  "short_name": "RouteGuard",
  "description": "RouteGuard driver tablet app",
  "start_url": "/driver",
  "display": "standalone",
  "background_color": "#1B3A5C",
  "theme_color": "#1B3A5C",
  "icons": [
    { "src": "/assets/Logo_Transparent.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Step 2: Register service worker in layout**

```tsx
// In a client component mounted in driver layout:
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
}, [])
```

**Step 3: Write service worker** — cache-first for app shell (`/driver`, `/driver/*`, static assets). Network-first for API calls. Queue failed POST requests (scans, locations) in IndexedDB and replay on reconnect.

**Step 4: Commit**

```bash
git add dashboard/
git commit -m "feat: add PWA manifest and service worker with offline scan queue"
```

---

### Task 57: Driver app layout + lock screen

**Files:**
- Create: `dashboard/app/driver/layout.tsx`
- Create: `dashboard/app/driver/page.tsx` (lock screen)
- Create: `dashboard/components/driver/lock-screen.tsx`
- Create: `dashboard/components/driver/pin-pad.tsx`

**Step 1: Driver layout**

```tsx
// Dark navy background, full viewport, no nav
// Checks device registration state (local storage) on mount
// If device not provisioned: shows "Contact your administrator"
// Otherwise: renders children
```

**Step 2: Lock screen**

```tsx
// Displays org logo (fetched from device's stored org data)
// Two options: PIN numpad or "Tap RFID badge"
// PIN pad: large touch-friendly number buttons, 4-6 digit input
// On submit: POST /api/v1/auth/pin → success: navigate to /driver/pre-trip
// On 401: flash red, clear input
```

**Step 3: Commit**

```bash
git add dashboard/app/driver/ dashboard/components/driver/
git commit -m "feat: add driver PWA lock screen with PIN pad"
```

---

### Task 58: Pre-trip screen

**Files:**
- Create: `dashboard/app/driver/pre-trip/page.tsx`
- Create: `dashboard/components/driver/route-summary.tsx`

Shows driver name, vehicle info, today's route name and type, full stop list with expected student counts. Large "Start Run" amber button → POST /api/v1/trips/start → navigates to /driver/run/[trip_id].

Stores trip manifest in IndexedDB for offline access.

**Commit:** `feat: add driver pre-trip screen`

---

### Task 59: Active run screen

**Files:**
- Create: `dashboard/app/driver/run/[tripId]/page.tsx`
- Create: `dashboard/components/driver/active-run.tsx`
- Create: `dashboard/components/driver/student-scan-list.tsx`
- Create: `dashboard/components/driver/scan-feedback.tsx`

**Features:**
- Current stop name (large text), remaining stops count
- Student list for current stop: name, grade, board/exit status badge
- RFID scan feedback: full-screen green flash (authorized) or red flash (unknown)
- "Next Stop" button → advances stop, updates display
- "End Run" button (with confirmation) → POST /api/v1/trips/:id/end
- GPS pings: `navigator.geolocation.watchPosition` → POST /api/v1/trips/:id/location every 5s
- If offline: queue scan + location events in IndexedDB

**Commit:** `feat: add driver active run screen with RFID feedback and GPS pings`

---

### Task 60: Run complete screen

**Files:**
- Create: `dashboard/app/driver/run/[tripId]/complete/page.tsx`

Shows: total students boarded, any missed students, run duration. "Done" button → clears driver session → returns to lock screen.

**Commit:** `feat: add driver run complete screen`

---

## Phase 10: Device OS Image

### Task 61: pi-gen configuration

**Files:**
- Create: `device/pi-gen/config`
- Create: `device/pi-gen/stage-routeguard/00-routeguard/00-run.sh`
- Create: `device/pi-gen/stage-routeguard/00-routeguard/files/routeguard-provision.service`
- Create: `device/pi-gen/stage-routeguard/00-routeguard/files/routeguard-kiosk.service`
- Create: `device/pi-gen/Dockerfile`

**Step 1: pi-gen config**

```bash
# device/pi-gen/config
IMG_NAME="routeguard-device"
RELEASE=bookworm
DEPLOY_COMPRESSION=gz
ENABLE_SSH=0
FIRST_USER_NAME=routeguard
FIRST_USER_PASS=routeguard # changed on provisioning
STAGE_LIST="stage0 stage1 stage2 stage-routeguard"
```

**Step 2: Installation script (00-run.sh)**

```bash
#!/bin/bash -e
# Install Chromium, set up kiosk mode, install provisioning service

on_chroot << EOF
apt-get install -y chromium-browser xorg openbox

# Firewall: only allow outbound to api.route-guard.com:443
apt-get install -y ufw
ufw default deny outgoing
ufw default deny incoming
ufw allow out to any port 53  # DNS
ufw allow out 443 proto tcp   # HTTPS only
ufw enable
EOF

install -m 644 files/routeguard-provision.service \
  "${ROOTFS_DIR}/etc/systemd/system/"
install -m 644 files/routeguard-kiosk.service \
  "${ROOTFS_DIR}/etc/systemd/system/"

on_chroot << EOF
systemctl enable routeguard-provision.service
systemctl enable routeguard-kiosk.service
EOF
```

**Step 3: Provisioning service**

```ini
# routeguard-provision.service
[Unit]
Description=RouteGuard Device Provisioning
After=network-online.target
ConditionPathExists=/boot/provision.json

[Service]
Type=oneshot
ExecStart=/usr/local/bin/rg-provision
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

**Step 4: Write rg-provision script** — reads `/boot/provision.json`, calls `api.route-guard.com/api/v1/devices/provision`, stores returned credential encrypted in `/var/lib/routeguard/device.key`, deletes `provision.json`, triggers kiosk mode.

**Step 5: Kiosk service** — starts X + Openbox + Chromium in `--kiosk --app=https://route-guard.com/driver` after provisioning completes.

**Step 6: Commit**

```bash
git add device/
git commit -m "feat: add pi-gen RPi OS image config with provisioning and kiosk mode"
```

---

## Phase 11: Dashboard Dockerfile + CI Finalization

### Task 62: Next.js Dockerfile

**Files:**
- Create: `dashboard/Dockerfile`
- Create: `dashboard/.dockerignore`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Add to `next.config.ts`:
```ts
output: 'standalone'
```

**Commit:** `feat: add Next.js standalone Dockerfile`

---

### Task 63: Security headers middleware (Next.js)

**Files:**
- Modify: `dashboard/middleware.ts`

```typescript
// dashboard/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://api.mapbox.com; " +
    "worker-src blob:; img-src 'self' data: https://*.mapbox.com https://*.mapbox.cn; " +
    "connect-src 'self' https://api.route-guard.com https://*.mapbox.com; " +
    "style-src 'self' 'unsafe-inline' https://api.mapbox.com;"
  )

  // Redirect /dashboard → /login if no session cookie present
  const session = request.cookies.get('rg_session')
  const { pathname } = request.nextUrl
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
```

**Commit:** `feat: add security headers and auth redirect middleware`

---

### Task 64: Deploy script + LXC setup docs

**Files:**
- Create: `deploy/scripts/setup-lxc.sh`
- Create: `deploy/scripts/deploy.sh`
- Create: `deploy/README.md`

**setup-lxc.sh:** Install Docker, register GitHub Actions self-hosted runner, configure UFW.

**deploy.sh:** Pull latest images from local registry, run `docker compose up -d`.

**README.md:** Step-by-step LXC setup instructions, env var documentation, SSL cert setup, first deploy.

**Commit:** `docs: add deployment scripts and LXC setup guide`

---

### Task 65: Final integration + smoke test

**Step 1: Start full stack locally**

```bash
cd deploy
cp .env.example .env
# Fill in all env vars with local test values
docker compose up -d postgres redis
# Run migrations
docker compose run --rm routeguard-api /api migrate
# Start services
docker compose up -d
```

**Step 2: Verify Go API health**

```bash
curl http://localhost:8080/health
```
Expected: `200 OK`

**Step 3: Verify Next.js renders**

```bash
curl http://localhost:3000
```
Expected: `200 OK` with HTML

**Step 4: Smoke test auth flow**

```bash
# Create a staff user directly in Postgres
# Then test login
curl -c cookies.txt -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@routeguard.com","password":"testpass"}'

# Verify session
curl -b cookies.txt http://localhost:8080/auth/me
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete RouteGuard rework - all services integrated"
```

---

## Appendix: Key Implementation Notes

### Org isolation

Every dashboard repository method receives `orgId string` as first parameter after `ctx`. Every Postgres query appends `AND org_id = $N`. No cross-org data leakage is possible by construction.

### Encrypted field pattern (Go)

```go
// On write:
encrypted, err := crypto.Encrypt(cfg.DataEncryptionKey, plain)
// On read:
plain, err := crypto.Decrypt(cfg.DataEncryptionKey, encrypted)
// Blank values pass through Encrypt/Decrypt as empty strings
```

### Redis key namespace

| Prefix | Purpose |
|--------|---------|
| `session:{token}` | User sessions |
| `device:{token_hash}` | Device credential cache |
| `provision_token:{token}` | One-time device provisioning tokens |
| `trip:manifest:{trip_id}` | Cached route manifest |
| `trip:location:{trip_id}` | Pub/sub channel — GPS events |
| `trip:scan:{trip_id}` | Pub/sub channel — scan events |
| `trip:alert:{org_id}` | Pub/sub channel — alert events |
| `rate:{ip}:{endpoint}` | Rate limiting counters |

### SSO role sync on login

```go
func syncSSOUserRoles(ctx context.Context, userID, connectionID string, claims map[string]any) error {
    // 1. Fetch all sso_role_mappings for connectionID
    // 2. For each mapping: check if claims[claim_key] contains claim_value
    // 3. Build set of matched role IDs
    // 4. DELETE user_roles WHERE user_id = $1
    // 5. INSERT user_roles for matched roles
    // 6. Update session in Redis with new permissions
}
```

### Permission list (full)

`org:manage` · `users:manage` · `schools:read` · `schools:write` · `students:read` · `students:write` · `routes:read` · `routes:write` · `vehicles:read` · `vehicles:write` · `drivers:read` · `drivers:write` · `trips:read` · `trips:write` · `reports:read` · `settings:read` · `settings:write` · `api_keys:manage` · `devices:manage`
