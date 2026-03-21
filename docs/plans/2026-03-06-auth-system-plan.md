# Multi-Tenant Auth System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-tenant auth system with global users, multi-org membership, full RBAC, SSO (OIDC/SAML) with JIT provisioning, PII encryption at rest, and a unified `/login` page.

**Architecture:** Go API uses chi router, pgx for Postgres, Redis for sessions/rate-limiting. PII encrypted with AES-256-GCM, email lookup via HMAC-SHA256 hash column. Sessions stored in Redis with 7-day TTL. Dashboard is Next.js 16 App Router. Auth cookie (`rg_session`) set via Next.js proxy route to avoid cross-origin issues.

**Tech Stack:** Go 1.24 (chi, pgx, go-redis, bcrypt, OIDC, SAML), PostgreSQL 16, Redis 7, Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui)

**Design doc:** `docs/plans/2026-03-06-auth-system-design.md`

---

### Task 1: Config - add encryption keys

Add `DATA_ENCRYPTION_KEY` and `HMAC_KEY` to the config loader. Both are 32-byte hex-encoded env vars with dev fallbacks.

**Files:**
- Modify: `routeguard-api/internal/config/config.go`

**Step 1: Update config struct and loader**

```go
package config

import (
	"encoding/hex"
	"fmt"
	"os"
)

type Config struct {
	Port              string
	DatabaseURL       string
	RedisAddr         string
	RedisPassword     string
	BaseURL           string
	APIBaseURL        string
	DataEncryptionKey []byte
	HMACKey           []byte
	IsProd            bool
}

func Load() (*Config, error) {
	dataKey, err := decodeHexKey("DATA_ENCRYPTION_KEY")
	if err != nil {
		return nil, fmt.Errorf("DATA_ENCRYPTION_KEY: %w", err)
	}
	hmacKey, err := decodeHexKey("HMAC_KEY")
	if err != nil {
		return nil, fmt.Errorf("HMAC_KEY: %w", err)
	}

	return &Config{
		Port:              envOr("PORT", "8080"),
		DatabaseURL:       mustEnv("DATABASE_URL"),
		RedisAddr:         mustEnv("REDIS_ADDR"),
		RedisPassword:     os.Getenv("REDIS_PASSWORD"),
		BaseURL:           envOr("BASE_URL", "http://localhost:3000"),
		APIBaseURL:        envOr("API_BASE_URL", "http://localhost:8080"),
		DataEncryptionKey: dataKey,
		HMACKey:           hmacKey,
		IsProd:            os.Getenv("NODE_ENV") == "production" || os.Getenv("ENV") == "production",
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

func decodeHexKey(envKey string) ([]byte, error) {
	s := os.Getenv(envKey)
	if s == "" {
		if os.Getenv("ENV") != "production" {
			return make([]byte, 32), nil
		}
		return nil, fmt.Errorf("required env var %s is not set", envKey)
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("invalid hex value: %w", err)
	}
	if len(b) != 32 {
		return nil, fmt.Errorf("must be 32 bytes (64 hex chars), got %d bytes", len(b))
	}
	return b, nil
}
```

**Step 2: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./cmd/api
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/config/config.go
git commit -m "feat: add DATA_ENCRYPTION_KEY and HMAC_KEY to config"
```

---

### Task 2: Crypto package - AES-256-GCM encryption and HMAC hashing

Create the crypto package with encrypt/decrypt (AES-256-GCM) and deterministic HMAC-SHA256 hashing for email lookups.

**Files:**
- Create: `routeguard-api/internal/crypto/crypto.go`
- Create: `routeguard-api/internal/crypto/crypto_test.go`

**Step 1: Write tests**

```go
package crypto_test

import (
	"testing"

	"github.com/routeguard/api/internal/crypto"
)

func TestEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	key[0] = 0x01

	plaintext := "hello@example.com"

	ciphertext, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if ciphertext == plaintext {
		t.Fatal("ciphertext should differ from plaintext")
	}

	decrypted, err := crypto.Decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted != plaintext {
		t.Fatalf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	key := make([]byte, 32)
	plaintext := "same input"

	c1, _ := crypto.Encrypt(key, plaintext)
	c2, _ := crypto.Encrypt(key, plaintext)

	if c1 == c2 {
		t.Fatal("two encryptions of the same plaintext should produce different ciphertexts (random nonce)")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key1[0] = 0x01
	key2 := make([]byte, 32)
	key2[0] = 0x02

	ciphertext, _ := crypto.Encrypt(key1, "secret")
	_, err := crypto.Decrypt(key2, ciphertext)
	if err == nil {
		t.Fatal("expected error decrypting with wrong key")
	}
}

func TestHMAC(t *testing.T) {
	key := make([]byte, 32)
	email := "user@example.com"

	h1 := crypto.HMAC(key, email)
	h2 := crypto.HMAC(key, email)

	if h1 != h2 {
		t.Fatal("HMAC should be deterministic")
	}

	if h1 == "" {
		t.Fatal("HMAC should not be empty")
	}

	h3 := crypto.HMAC(key, "other@example.com")
	if h1 == h3 {
		t.Fatal("different inputs should produce different HMACs")
	}
}

func TestHMACDifferentKeys(t *testing.T) {
	key1 := make([]byte, 32)
	key1[0] = 0x01
	key2 := make([]byte, 32)
	key2[0] = 0x02

	h1 := crypto.HMAC(key1, "user@example.com")
	h2 := crypto.HMAC(key2, "user@example.com")

	if h1 == h2 {
		t.Fatal("different keys should produce different HMACs")
	}
}
```

**Step 2: Run tests to verify they fail**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go test -v ./internal/crypto/
```

Expected: FAIL (package does not exist)

**Step 3: Implement crypto package**

```go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
)

// Encrypt encrypts plaintext using AES-256-GCM with a random nonce.
// Returns hex-encoded ciphertext (nonce || ciphertext).
func Encrypt(key []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypt decrypts hex-encoded AES-256-GCM ciphertext (nonce || ciphertext).
func Decrypt(key []byte, ciphertextHex string) (string, error) {
	data, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", fmt.Errorf("decode hex: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}

// HMAC computes a deterministic HMAC-SHA256 of the input using the given key.
// Returns hex-encoded hash. Used for indexed lookups of encrypted fields.
func HMAC(key []byte, input string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(input))
	return hex.EncodeToString(mac.Sum(nil))
}
```

**Step 4: Run tests to verify they pass**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go test -v ./internal/crypto/
```

Expected: All PASS

**Step 5: Commit**

```bash
git add routeguard-api/internal/crypto/
git commit -m "feat: add AES-256-GCM encryption and HMAC-SHA256 hashing"
```

---

### Task 3: Database migration - create auth schema

Create the migration runner and the initial auth schema migration.

**Files:**
- Create: `routeguard-api/internal/db/migrate.go`
- Create: `routeguard-api/migrations/001_auth_schema.up.sql`
- Create: `routeguard-api/migrations/001_auth_schema.down.sql`
- Modify: `routeguard-api/cmd/api/main.go` (add migration call)

**Step 1: Install golang-migrate dependency**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go get github.com/golang-migrate/migrate/v4@latest && go get github.com/golang-migrate/migrate/v4/database/pgx/v5@latest && go get github.com/golang-migrate/migrate/v4/source/file@latest
```

**Step 2: Create migrate.go**

```go
package db

import (
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// RunMigrations runs all pending up migrations from the given directory.
func RunMigrations(databaseURL, migrationsPath string) error {
	m, err := migrate.New(
		fmt.Sprintf("file://%s", migrationsPath),
		databaseURL,
	)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}
```

**Step 3: Create up migration**

```sql
-- 001_auth_schema.up.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Global users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_enc TEXT NOT NULL,
    email_hash TEXT NOT NULL UNIQUE,
    name_enc TEXT NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email_hash ON users (email_hash);

-- Organizations (tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_enc TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_platform BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_organizations_slug ON organizations (slug);

-- Org memberships (many-to-many)
CREATE TABLE org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);

CREATE INDEX idx_org_memberships_user_id ON org_memberships (user_id);
CREATE INDEX idx_org_memberships_org_id ON org_memberships (org_id);

-- Org roles (RBAC)
CREATE TABLE org_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_roles_org_id ON org_roles (org_id);

-- Member role assignments
CREATE TABLE org_member_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL REFERENCES org_memberships (id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES org_roles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (membership_id, role_id)
);

-- SSO connections per org
CREATE TABLE sso_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('oidc', 'saml')),
    display_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    oidc_issuer_url TEXT,
    oidc_client_id TEXT,
    oidc_client_secret_enc TEXT,
    oidc_scopes TEXT,
    saml_entity_id TEXT,
    saml_sso_url TEXT,
    saml_certificate_enc TEXT,
    saml_metadata_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sso_connections_org_id ON sso_connections (org_id);

-- User identities (password, oidc, saml)
CREATE TABLE user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_identities_user_id ON user_identities (user_id);
CREATE INDEX idx_user_identities_provider_user_id ON user_identities (provider_user_id);

-- Seed the platform organization
INSERT INTO organizations (id, name_enc, slug, is_platform)
VALUES ('00000000-0000-0000-0000-000000000001', 'RouteGuard', 'routeguard', true);

-- Seed platform Owner role
INSERT INTO org_roles (id, org_id, name, permissions, is_system)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Owner',
    ARRAY['platform:manage', 'org:manage', 'members:read', 'members:write', 'roles:read', 'roles:write', 'sso:read', 'sso:write'],
    true
);
```

Note: The platform org `name_enc` is seeded as plaintext 'RouteGuard' for bootstrapping. On first startup, a seed script or manual step could re-encrypt it, or we accept it as a known value since it's not sensitive.

**Step 4: Create down migration**

```sql
-- 001_auth_schema.down.sql

DROP TABLE IF EXISTS user_identities;
DROP TABLE IF EXISTS sso_connections;
DROP TABLE IF EXISTS org_member_roles;
DROP TABLE IF EXISTS org_roles;
DROP TABLE IF EXISTS org_memberships;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;
```

**Step 5: Add migration call to main.go**

Update `cmd/api/main.go` to run migrations before connecting the pool:

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

	// Run database migrations
	migrationsPath := envOr("MIGRATIONS_PATH", "./migrations")
	log.Info().Str("path", migrationsPath).Msg("running database migrations")
	if err := db.RunMigrations(cfg.DatabaseURL, migrationsPath); err != nil {
		log.Fatal().Err(err).Msg("failed to run migrations")
	}
	log.Info().Msg("migrations complete")

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

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
```

**Step 6: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go mod tidy && go build ./cmd/api
```

**Step 7: Commit**

```bash
git add routeguard-api/internal/db/migrate.go routeguard-api/migrations/ routeguard-api/cmd/api/main.go routeguard-api/go.mod routeguard-api/go.sum
git commit -m "feat: add auth schema migration with users, orgs, RBAC, SSO tables"
```

---

### Task 4: Domain types

Create the domain types that map to the database schema.

**Files:**
- Create: `routeguard-api/internal/domain/types.go`

**Step 1: Create domain types**

```go
package domain

import "time"

type User struct {
	ID           string    `json:"id"`
	EmailEnc     string    `json:"-"`
	EmailHash    string    `json:"-"`
	Email        string    `json:"email"`
	NameEnc      string    `json:"-"`
	Name         string    `json:"name"`
	PasswordHash *string   `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Organization struct {
	ID         string    `json:"id"`
	NameEnc    string    `json:"-"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	IsPlatform bool      `json:"is_platform"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type OrgMembership struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	OrgID     string    `json:"org_id"`
	CreatedAt time.Time `json:"created_at"`
}

type OrgRole struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	Name        string    `json:"name"`
	Permissions []string  `json:"permissions"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
}

type OrgMemberRole struct {
	ID           string    `json:"id"`
	MembershipID string    `json:"membership_id"`
	RoleID       string    `json:"role_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type SSOConnection struct {
	ID                  string    `json:"id"`
	OrgID               string    `json:"org_id"`
	Type                string    `json:"type"`
	DisplayName         string    `json:"display_name"`
	Enabled             bool      `json:"enabled"`
	OIDCIssuerURL       *string   `json:"oidc_issuer_url,omitempty"`
	OIDCClientID        *string   `json:"oidc_client_id,omitempty"`
	OIDCClientSecretEnc *string   `json:"-"`
	OIDCScopes          *string   `json:"oidc_scopes,omitempty"`
	SAMLEntityID        *string   `json:"saml_entity_id,omitempty"`
	SAMLSSOURL          *string   `json:"saml_sso_url,omitempty"`
	SAMLCertificateEnc  *string   `json:"-"`
	SAMLMetadataURL     *string   `json:"saml_metadata_url,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type UserIdentity struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Provider       string    `json:"provider"`
	ProviderUserID *string   `json:"provider_user_id,omitempty"`
	Metadata       []byte    `json:"metadata,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// SessionPayload is stored in Redis as the session value.
type SessionPayload struct {
	UserID      string   `json:"user_id"`
	OrgID       string   `json:"org_id"`
	Permissions []string `json:"permissions"`
	CreatedAt   int64    `json:"created_at"`
}

// AuthMethodsResponse is returned by the /auth/lookup endpoint.
type AuthMethodsResponse struct {
	HasPassword bool              `json:"has_password"`
	SSOOptions  []SSOOptionPublic `json:"sso_options"`
}

// SSOOptionPublic is the public-facing SSO connection info for the login page.
type SSOOptionPublic struct {
	ConnectionID string `json:"connection_id"`
	Type         string `json:"type"`
	DisplayName  string `json:"display_name"`
	OrgSlug      string `json:"org_slug"`
	OrgName      string `json:"org_name"`
}

// OrgSummary is a lightweight org representation for the org selector.
type OrgSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPlatform bool   `json:"is_platform"`
}

// MeResponse is returned by /auth/me.
type MeResponse struct {
	User        User       `json:"user"`
	ActiveOrg   OrgSummary `json:"active_org"`
	Permissions []string   `json:"permissions"`
}
```

**Step 2: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./cmd/api
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/domain/
git commit -m "feat: add domain types for users, orgs, RBAC, SSO, sessions"
```

---

### Task 5: Repository - user repo

Create the user repository with CRUD operations and encrypted field handling.

**Files:**
- Create: `routeguard-api/internal/repository/user_repo.go`
- Create: `routeguard-api/internal/repository/user_repo_test.go`

**Step 1: Write tests**

```go
package repository_test

import (
	"context"
	"testing"

	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
)

// These tests require a running Postgres instance.
// Skip in CI if DATABASE_URL is not set.

func TestUserRepo_CreateAndGetByEmailHash(t *testing.T) {
	pool := testPool(t)
	repo := repository.NewUserRepo(pool)
	ctx := context.Background()

	encKey := make([]byte, 32)
	encKey[0] = 0x01
	hmacKey := make([]byte, 32)
	hmacKey[0] = 0x02

	email := "test@example.com"
	emailEnc, _ := crypto.Encrypt(encKey, email)
	emailHash := crypto.HMAC(hmacKey, email)
	nameEnc, _ := crypto.Encrypt(encKey, "Test User")
	passwordHash := "$2a$10$fakehash"

	user, err := repo.Create(ctx, emailEnc, emailHash, nameEnc, &passwordHash)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if user.ID == "" {
		t.Fatal("expected user ID")
	}

	found, err := repo.GetByEmailHash(ctx, emailHash)
	if err != nil {
		t.Fatalf("GetByEmailHash failed: %v", err)
	}

	if found.ID != user.ID {
		t.Fatalf("expected ID %s, got %s", user.ID, found.ID)
	}
	if found.EmailEnc != emailEnc {
		t.Fatal("email_enc mismatch")
	}
}
```

Note: `testPool` is a helper that connects to a test database. The executor should create a shared test helper file `routeguard-api/internal/repository/testutil_test.go`:

```go
package repository_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect to test db: %v", err)
	}
	t.Cleanup(func() { pool.Close() })
	return pool
}
```

**Step 2: Implement user repo**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) Create(ctx context.Context, emailEnc, emailHash, nameEnc string, passwordHash *string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email_enc, email_hash, name_enc, password_hash)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email_enc, email_hash, name_enc, password_hash, created_at, updated_at`,
		emailEnc, emailHash, nameEnc, passwordHash,
	).Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email_enc, email_hash, name_enc, password_hash, created_at, updated_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) GetByEmailHash(ctx context.Context, emailHash string) (*domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email_enc, email_hash, name_enc, password_hash, created_at, updated_at
		 FROM users WHERE email_hash = $1`, emailHash,
	).Scan(&u.ID, &u.EmailEnc, &u.EmailHash, &u.NameEnc, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by email hash: %w", err)
	}
	return &u, nil
}
```

**Step 3: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./...
```

**Step 4: Commit**

```bash
git add routeguard-api/internal/repository/ routeguard-api/internal/domain/
git commit -m "feat: add user repository with encrypted email/name storage"
```

---

### Task 6: Repository - org, membership, and role repos

Create repositories for organizations, memberships, roles, and member role assignments.

**Files:**
- Create: `routeguard-api/internal/repository/org_repo.go`
- Create: `routeguard-api/internal/repository/membership_repo.go`
- Create: `routeguard-api/internal/repository/role_repo.go`

**Step 1: Implement org repo**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type OrgRepo struct {
	pool *pgxpool.Pool
}

func NewOrgRepo(pool *pgxpool.Pool) *OrgRepo {
	return &OrgRepo{pool: pool}
}

func (r *OrgRepo) Create(ctx context.Context, nameEnc, slug string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`INSERT INTO organizations (name_enc, slug)
		 VALUES ($1, $2)
		 RETURNING id, name_enc, slug, is_platform, created_at, updated_at`,
		nameEnc, slug,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create org: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) GetByID(ctx context.Context, id string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`SELECT id, name_enc, slug, is_platform, created_at, updated_at
		 FROM organizations WHERE id = $1`, id,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get org by id: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) GetBySlug(ctx context.Context, slug string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`SELECT id, name_enc, slug, is_platform, created_at, updated_at
		 FROM organizations WHERE slug = $1`, slug,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get org by slug: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) List(ctx context.Context) ([]domain.Organization, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name_enc, slug, is_platform, created_at, updated_at
		 FROM organizations ORDER BY created_at`)
	if err != nil {
		return nil, fmt.Errorf("list orgs: %w", err)
	}
	defer rows.Close()

	var orgs []domain.Organization
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan org: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, nil
}

func (r *OrgRepo) Update(ctx context.Context, id, nameEnc, slug string) (*domain.Organization, error) {
	var o domain.Organization
	err := r.pool.QueryRow(ctx,
		`UPDATE organizations SET name_enc = $2, slug = $3, updated_at = now()
		 WHERE id = $1
		 RETURNING id, name_enc, slug, is_platform, created_at, updated_at`,
		id, nameEnc, slug,
	).Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update org: %w", err)
	}
	return &o, nil
}

func (r *OrgRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM organizations WHERE id = $1 AND is_platform = false`, id)
	if err != nil {
		return fmt.Errorf("delete org: %w", err)
	}
	return nil
}

// SeedSystemRoles creates the default Owner and Member roles for a new org.
func (r *OrgRepo) SeedSystemRoles(ctx context.Context, orgID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO org_roles (org_id, name, permissions, is_system) VALUES
		 ($1, 'Owner', ARRAY['org:manage', 'members:read', 'members:write', 'roles:read', 'roles:write', 'sso:read', 'sso:write'], true),
		 ($1, 'Member', ARRAY['members:read'], true)`,
		orgID,
	)
	if err != nil {
		return fmt.Errorf("seed system roles: %w", err)
	}
	return nil
}
```

**Step 2: Implement membership repo**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type MembershipRepo struct {
	pool *pgxpool.Pool
}

func NewMembershipRepo(pool *pgxpool.Pool) *MembershipRepo {
	return &MembershipRepo{pool: pool}
}

func (r *MembershipRepo) Create(ctx context.Context, userID, orgID string) (*domain.OrgMembership, error) {
	var m domain.OrgMembership
	err := r.pool.QueryRow(ctx,
		`INSERT INTO org_memberships (user_id, org_id)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, org_id) DO UPDATE SET user_id = EXCLUDED.user_id
		 RETURNING id, user_id, org_id, created_at`,
		userID, orgID,
	).Scan(&m.ID, &m.UserID, &m.OrgID, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create membership: %w", err)
	}
	return &m, nil
}

func (r *MembershipRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM org_memberships WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete membership: %w", err)
	}
	return nil
}

func (r *MembershipRepo) GetByUserAndOrg(ctx context.Context, userID, orgID string) (*domain.OrgMembership, error) {
	var m domain.OrgMembership
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, org_id, created_at
		 FROM org_memberships WHERE user_id = $1 AND org_id = $2`,
		userID, orgID,
	).Scan(&m.ID, &m.UserID, &m.OrgID, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get membership: %w", err)
	}
	return &m, nil
}

// ListByUser returns all memberships for a user, with decrypted org name.
// The caller must decrypt NameEnc on the returned orgs.
func (r *MembershipRepo) ListOrgsByUser(ctx context.Context, userID string) ([]domain.Organization, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT o.id, o.name_enc, o.slug, o.is_platform, o.created_at, o.updated_at
		 FROM organizations o
		 JOIN org_memberships m ON m.org_id = o.id
		 WHERE m.user_id = $1
		 ORDER BY o.created_at`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list orgs by user: %w", err)
	}
	defer rows.Close()

	var orgs []domain.Organization
	for rows.Next() {
		var o domain.Organization
		if err := rows.Scan(&o.ID, &o.NameEnc, &o.Slug, &o.IsPlatform, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan org: %w", err)
		}
		orgs = append(orgs, o)
	}
	return orgs, nil
}

// ListMembersByOrg returns all user memberships for an org.
func (r *MembershipRepo) ListMembersByOrg(ctx context.Context, orgID string) ([]domain.OrgMembership, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, org_id, created_at
		 FROM org_memberships WHERE org_id = $1
		 ORDER BY created_at`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list members by org: %w", err)
	}
	defer rows.Close()

	var members []domain.OrgMembership
	for rows.Next() {
		var m domain.OrgMembership
		if err := rows.Scan(&m.ID, &m.UserID, &m.OrgID, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan membership: %w", err)
		}
		members = append(members, m)
	}
	return members, nil
}

// GetUserPermissions returns all permission strings for a user in an org
// by joining through membership -> member_roles -> roles.
func (r *MembershipRepo) GetUserPermissions(ctx context.Context, userID, orgID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT unnest(r.permissions)
		 FROM org_roles r
		 JOIN org_member_roles mr ON mr.role_id = r.id
		 JOIN org_memberships m ON m.id = mr.membership_id
		 WHERE m.user_id = $1 AND m.org_id = $2`,
		userID, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("get user permissions: %w", err)
	}
	defer rows.Close()

	var perms []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		perms = append(perms, p)
	}
	return perms, nil
}
```

**Step 3: Implement role repo**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type RoleRepo struct {
	pool *pgxpool.Pool
}

func NewRoleRepo(pool *pgxpool.Pool) *RoleRepo {
	return &RoleRepo{pool: pool}
}

func (r *RoleRepo) Create(ctx context.Context, orgID, name string, permissions []string) (*domain.OrgRole, error) {
	var role domain.OrgRole
	err := r.pool.QueryRow(ctx,
		`INSERT INTO org_roles (org_id, name, permissions)
		 VALUES ($1, $2, $3)
		 RETURNING id, org_id, name, permissions, is_system, created_at`,
		orgID, name, permissions,
	).Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create role: %w", err)
	}
	return &role, nil
}

func (r *RoleRepo) GetByID(ctx context.Context, id string) (*domain.OrgRole, error) {
	var role domain.OrgRole
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, name, permissions, is_system, created_at
		 FROM org_roles WHERE id = $1`, id,
	).Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get role: %w", err)
	}
	return &role, nil
}

func (r *RoleRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.OrgRole, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, name, permissions, is_system, created_at
		 FROM org_roles WHERE org_id = $1 ORDER BY is_system DESC, name`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.OrgRole
	for rows.Next() {
		var role domain.OrgRole
		if err := rows.Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, nil
}

func (r *RoleRepo) Update(ctx context.Context, id, name string, permissions []string) (*domain.OrgRole, error) {
	var role domain.OrgRole
	err := r.pool.QueryRow(ctx,
		`UPDATE org_roles SET name = $2, permissions = $3
		 WHERE id = $1 AND is_system = false
		 RETURNING id, org_id, name, permissions, is_system, created_at`,
		id, name, permissions,
	).Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update role: %w", err)
	}
	return &role, nil
}

func (r *RoleRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM org_roles WHERE id = $1 AND is_system = false`, id)
	if err != nil {
		return fmt.Errorf("delete role: %w", err)
	}
	return nil
}

func (r *RoleRepo) AssignToMember(ctx context.Context, membershipID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO org_member_roles (membership_id, role_id)
		 VALUES ($1, $2)
		 ON CONFLICT (membership_id, role_id) DO NOTHING`,
		membershipID, roleID,
	)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	return nil
}

func (r *RoleRepo) UnassignFromMember(ctx context.Context, membershipID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM org_member_roles WHERE membership_id = $1 AND role_id = $2`,
		membershipID, roleID,
	)
	if err != nil {
		return fmt.Errorf("unassign role: %w", err)
	}
	return nil
}

func (r *RoleRepo) ListMemberRoles(ctx context.Context, membershipID string) ([]domain.OrgRole, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT r.id, r.org_id, r.name, r.permissions, r.is_system, r.created_at
		 FROM org_roles r
		 JOIN org_member_roles mr ON mr.role_id = r.id
		 WHERE mr.membership_id = $1
		 ORDER BY r.name`, membershipID,
	)
	if err != nil {
		return nil, fmt.Errorf("list member roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.OrgRole
	for rows.Next() {
		var role domain.OrgRole
		if err := rows.Scan(&role.ID, &role.OrgID, &role.Name, &role.Permissions, &role.IsSystem, &role.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, role)
	}
	return roles, nil
}
```

**Step 4: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./...
```

**Step 5: Commit**

```bash
git add routeguard-api/internal/repository/
git commit -m "feat: add org, membership, and role repositories"
```

---

### Task 7: Repository - SSO connection repo

Create the SSO connection repository for OIDC/SAML config CRUD.

**Files:**
- Create: `routeguard-api/internal/repository/sso_repo.go`

**Step 1: Implement SSO repo**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type SSORepo struct {
	pool *pgxpool.Pool
}

func NewSSORepo(pool *pgxpool.Pool) *SSORepo {
	return &SSORepo{pool: pool}
}

func (r *SSORepo) Create(ctx context.Context, conn *domain.SSOConnection) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx,
		`INSERT INTO sso_connections (org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at`,
		conn.OrgID, conn.Type, conn.DisplayName, conn.Enabled,
		conn.OIDCIssuerURL, conn.OIDCClientID, conn.OIDCClientSecretEnc, conn.OIDCScopes,
		conn.SAMLEntityID, conn.SAMLSSOURL, conn.SAMLCertificateEnc, conn.SAMLMetadataURL,
	).Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create sso connection: %w", err)
	}
	return &c, nil
}

func (r *SSORepo) GetByID(ctx context.Context, id string) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at
		 FROM sso_connections WHERE id = $1`, id,
	).Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get sso connection: %w", err)
	}
	return &c, nil
}

func (r *SSORepo) ListByOrg(ctx context.Context, orgID string) ([]domain.SSOConnection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at
		 FROM sso_connections WHERE org_id = $1 ORDER BY created_at`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list sso connections: %w", err)
	}
	defer rows.Close()

	var conns []domain.SSOConnection
	for rows.Next() {
		var c domain.SSOConnection
		if err := rows.Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
			&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
			&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
			&c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan sso connection: %w", err)
		}
		conns = append(conns, c)
	}
	return conns, nil
}

// ListEnabledByOrgSlugs returns enabled SSO connections for orgs a user belongs to.
// Used by the /auth/lookup endpoint to show available SSO options.
func (r *SSORepo) ListEnabledByUserOrgs(ctx context.Context, userID string) ([]domain.SSOConnection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.org_id, s.type, s.display_name, s.enabled,
		 s.oidc_issuer_url, s.oidc_client_id, s.oidc_client_secret_enc, s.oidc_scopes,
		 s.saml_entity_id, s.saml_sso_url, s.saml_certificate_enc, s.saml_metadata_url,
		 s.created_at, s.updated_at
		 FROM sso_connections s
		 JOIN org_memberships m ON m.org_id = s.org_id
		 WHERE m.user_id = $1 AND s.enabled = true
		 ORDER BY s.created_at`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list enabled sso by user orgs: %w", err)
	}
	defer rows.Close()

	var conns []domain.SSOConnection
	for rows.Next() {
		var c domain.SSOConnection
		if err := rows.Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
			&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
			&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
			&c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan sso connection: %w", err)
		}
		conns = append(conns, c)
	}
	return conns, nil
}

func (r *SSORepo) Update(ctx context.Context, conn *domain.SSOConnection) (*domain.SSOConnection, error) {
	var c domain.SSOConnection
	err := r.pool.QueryRow(ctx,
		`UPDATE sso_connections SET display_name = $2, enabled = $3,
		 oidc_issuer_url = $4, oidc_client_id = $5, oidc_client_secret_enc = $6, oidc_scopes = $7,
		 saml_entity_id = $8, saml_sso_url = $9, saml_certificate_enc = $10, saml_metadata_url = $11,
		 updated_at = now()
		 WHERE id = $1
		 RETURNING id, org_id, type, display_name, enabled,
		 oidc_issuer_url, oidc_client_id, oidc_client_secret_enc, oidc_scopes,
		 saml_entity_id, saml_sso_url, saml_certificate_enc, saml_metadata_url,
		 created_at, updated_at`,
		conn.ID, conn.DisplayName, conn.Enabled,
		conn.OIDCIssuerURL, conn.OIDCClientID, conn.OIDCClientSecretEnc, conn.OIDCScopes,
		conn.SAMLEntityID, conn.SAMLSSOURL, conn.SAMLCertificateEnc, conn.SAMLMetadataURL,
	).Scan(&c.ID, &c.OrgID, &c.Type, &c.DisplayName, &c.Enabled,
		&c.OIDCIssuerURL, &c.OIDCClientID, &c.OIDCClientSecretEnc, &c.OIDCScopes,
		&c.SAMLEntityID, &c.SAMLSSOURL, &c.SAMLCertificateEnc, &c.SAMLMetadataURL,
		&c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update sso connection: %w", err)
	}
	return &c, nil
}

func (r *SSORepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sso_connections WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete sso connection: %w", err)
	}
	return nil
}
```

**Step 2: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./...
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/sso_repo.go
git commit -m "feat: add SSO connection repository"
```

---

### Task 8: Session management and auth middleware

Create session management (create/get/delete/switch in Redis) and the Authenticate middleware.

**Files:**
- Create: `routeguard-api/internal/auth/session.go`
- Create: `routeguard-api/internal/middleware/auth.go`
- Create: `routeguard-api/internal/middleware/rbac.go`
- Create: `routeguard-api/internal/middleware/rate_limit.go`

**Step 1: Implement session manager**

```go
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
)

const (
	SessionTTL    = 7 * 24 * time.Hour
	sessionPrefix = "session:"
	userSetPrefix = "user_sessions:"
)

// CreateSession generates a random token, stores the payload in Redis, and returns the token.
func CreateSession(ctx context.Context, c *cache.Cache, payload *domain.SessionPayload) (string, error) {
	token, err := generateToken(32)
	if err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}

	payload.CreatedAt = time.Now().Unix()

	if err := c.Set(ctx, sessionPrefix+token, payload, SessionTTL); err != nil {
		return "", fmt.Errorf("store session: %w", err)
	}

	// Track token in per-user set for bulk invalidation
	if err := c.SAdd(ctx, userSetPrefix+payload.UserID, token, SessionTTL); err != nil {
		return "", fmt.Errorf("track session: %w", err)
	}

	return token, nil
}

// GetSession retrieves the session payload for a token.
func GetSession(ctx context.Context, c *cache.Cache, token string) (*domain.SessionPayload, error) {
	var payload domain.SessionPayload
	if err := c.Get(ctx, sessionPrefix+token, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

// UpdateSession overwrites the session payload (used for org switching).
func UpdateSession(ctx context.Context, c *cache.Cache, token string, payload *domain.SessionPayload) error {
	return c.Set(ctx, sessionPrefix+token, payload, SessionTTL)
}

// DeleteSession removes a session from Redis.
func DeleteSession(ctx context.Context, c *cache.Cache, token string) error {
	return c.Del(ctx, sessionPrefix+token)
}

// InvalidateUserSessions removes all sessions for a user.
func InvalidateUserSessions(ctx context.Context, c *cache.Cache, userID string) error {
	tokens, err := c.SMembers(ctx, userSetPrefix+userID)
	if err != nil {
		return err
	}
	for _, t := range tokens {
		_ = c.Del(ctx, sessionPrefix+t)
	}
	return c.Del(ctx, userSetPrefix+userID)
}

func generateToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
```

**Step 2: Implement auth middleware**

```go
package middleware

import (
	"context"
	"net/http"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
)

type contextKey string

const sessionContextKey contextKey = "session"

// Authenticate validates the rg_session cookie and injects SessionPayload into the context.
func Authenticate(c *cache.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("rg_session")
			if err != nil || cookie.Value == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			payload, err := auth.GetSession(r.Context(), c, cookie.Value)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), sessionContextKey, payload)
			ctx = context.WithValue(ctx, contextKey("session_token"), cookie.Value)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionFromContext retrieves the SessionPayload from the request context.
func SessionFromContext(ctx context.Context) *domain.SessionPayload {
	s, _ := ctx.Value(sessionContextKey).(*domain.SessionPayload)
	return s
}

// TokenFromContext retrieves the raw session token from the request context.
func TokenFromContext(ctx context.Context) string {
	t, _ := ctx.Value(contextKey("session_token")).(string)
	return t
}
```

**Step 3: Implement RBAC middleware**

```go
package middleware

import (
	"net/http"
	"slices"
)

// RequirePermission checks that the session has the given permission.
func RequirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := SessionFromContext(r.Context())
			if session == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			if !slices.Contains(session.Permissions, perm) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequirePlatform checks that the session's active org is the platform org.
func RequirePlatform(platformOrgID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := SessionFromContext(r.Context())
			if session == nil || session.OrgID != platformOrgID {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

**Step 4: Implement rate limiter**

```go
package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/routeguard/api/internal/cache"
)

// RateLimit limits requests per IP per minute.
func RateLimit(c *cache.Cache, maxPerMinute int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			key := fmt.Sprintf("rate:%s:%s", r.URL.Path, ip)

			count, err := c.Incr(r.Context(), key)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			if count == 1 {
				_ = c.Expire(r.Context(), key, time.Minute)
			}

			if count > maxPerMinute {
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
```

**Step 5: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./...
```

**Step 6: Commit**

```bash
git add routeguard-api/internal/auth/ routeguard-api/internal/middleware/
git commit -m "feat: add session management, auth middleware, RBAC, and rate limiting"
```

---

### Task 9: API handler - respond helpers and Handler struct

Create the shared Handler struct and JSON response helpers.

**Files:**
- Create: `routeguard-api/internal/api/handler.go`
- Create: `routeguard-api/internal/api/respond.go`

**Step 1: Create handler struct**

```go
package api

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/repository"
)

type Handler struct {
	pool       *pgxpool.Pool
	cache      *cache.Cache
	cfg        *config.Config
	users      *repository.UserRepo
	orgs       *repository.OrgRepo
	members    *repository.MembershipRepo
	roles      *repository.RoleRepo
	sso        *repository.SSORepo
}

func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config) *Handler {
	return &Handler{
		pool:    pool,
		cache:   c,
		cfg:     cfg,
		users:   repository.NewUserRepo(pool),
		orgs:    repository.NewOrgRepo(pool),
		members: repository.NewMembershipRepo(pool),
		roles:   repository.NewRoleRepo(pool),
		sso:     repository.NewSSORepo(pool),
	}
}
```

**Step 2: Create respond helpers**

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "encoding error", http.StatusInternalServerError)
	}
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

func isNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
```

**Step 3: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./...
```

**Step 4: Commit**

```bash
git add routeguard-api/internal/api/
git commit -m "feat: add Handler struct and JSON response helpers"
```

---

### Task 10: API handler - auth lookup and login

Implement the `/auth/lookup` and `/auth/login` endpoints.

**Files:**
- Create: `routeguard-api/internal/api/auth_handler.go`

**Step 1: Implement auth handlers**

```go
package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

type lookupRequest struct {
	Email string `json:"email"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	User User        `json:"user"`
	Orgs []orgOption `json:"orgs"`
}

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type orgOption struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPlatform bool   `json:"is_platform"`
}

// Lookup returns available auth methods for an email address.
func (h *Handler) Lookup(w http.ResponseWriter, r *http.Request) {
	var req lookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		Error(w, http.StatusBadRequest, "email is required")
		return
	}

	emailHash := crypto.HMAC(h.cfg.HMACKey, email)
	user, err := h.users.GetByEmailHash(r.Context(), emailHash)

	resp := domain.AuthMethodsResponse{}

	if err != nil {
		// User not found - return empty methods (don't reveal if email exists for SSO)
		// But still check if any org has SSO that could JIT provision
		JSON(w, http.StatusOK, resp)
		return
	}

	// Check if user has a password
	resp.HasPassword = user.PasswordHash != nil

	// Find SSO options from orgs the user belongs to
	ssoConns, err := h.sso.ListEnabledByUserOrgs(r.Context(), user.ID)
	if err == nil {
		for _, conn := range ssoConns {
			org, err := h.orgs.GetByID(r.Context(), conn.OrgID)
			if err != nil {
				continue
			}
			orgName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)
			resp.SSOOptions = append(resp.SSOOptions, domain.SSOOptionPublic{
				ConnectionID: conn.ID,
				Type:         conn.Type,
				DisplayName:  conn.DisplayName,
				OrgSlug:      org.Slug,
				OrgName:      orgName,
			})
		}
	}

	JSON(w, http.StatusOK, resp)
}

// Login authenticates with email + password.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		Error(w, http.StatusBadRequest, "email and password are required")
		return
	}

	emailHash := crypto.HMAC(h.cfg.HMACKey, email)
	user, err := h.users.GetByEmailHash(r.Context(), emailHash)
	if err != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if user.PasswordHash == nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Get user's orgs
	orgs, err := h.members.ListOrgsByUser(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organizations")
		return
	}

	if len(orgs) == 0 {
		Error(w, http.StatusForbidden, "no organization membership")
		return
	}

	// Auto-select first org, or let client pick
	selectedOrg := orgs[0]

	// Load permissions for selected org
	perms, err := h.members.GetUserPermissions(r.Context(), user.ID, selectedOrg.ID)
	if err != nil {
		perms = []string{}
	}

	// Create session
	payload := &domain.SessionPayload{
		UserID:      user.ID,
		OrgID:       selectedOrg.ID,
		Permissions: perms,
	}

	token, err := auth.CreateSession(r.Context(), h.cache, payload)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Set cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "rg_session",
		Value:    token,
		Path:     "/",
		MaxAge:   int(auth.SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.IsProd,
		SameSite: http.SameSiteLaxMode,
	})

	// Decrypt user fields for response
	decryptedEmail, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
	decryptedName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)

	orgOptions := make([]orgOption, len(orgs))
	for i, o := range orgs {
		name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, o.NameEnc)
		orgOptions[i] = orgOption{
			ID:         o.ID,
			Name:       name,
			Slug:       o.Slug,
			IsPlatform: o.IsPlatform,
		}
	}

	JSON(w, http.StatusOK, loginResponse{
		User: User{
			ID:    user.ID,
			Email: decryptedEmail,
			Name:  decryptedName,
		},
		Orgs: orgOptions,
	})
}

// Logout destroys the session.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := middleware.TokenFromContext(r.Context())
	if token != "" {
		_ = auth.DeleteSession(r.Context(), h.cache, token)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "rg_session",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.IsProd,
		SameSite: http.SameSiteLaxMode,
	})

	NoContent(w)
}

// Me returns the current user, active org, and permissions.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.users.GetByID(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	org, err := h.orgs.GetByID(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organization")
		return
	}

	decryptedEmail, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
	decryptedName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)
	orgName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)

	JSON(w, http.StatusOK, domain.MeResponse{
		User: domain.User{
			ID:        user.ID,
			Email:     decryptedEmail,
			Name:      decryptedName,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		},
		ActiveOrg: domain.OrgSummary{
			ID:         org.ID,
			Name:       orgName,
			Slug:       org.Slug,
			IsPlatform: org.IsPlatform,
		},
		Permissions: session.Permissions,
	})
}

// SwitchOrg changes the active org in the session.
func (h *Handler) SwitchOrg(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	token := middleware.TokenFromContext(r.Context())

	var req struct {
		OrgID string `json:"org_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.OrgID == "" {
		Error(w, http.StatusBadRequest, "org_id is required")
		return
	}

	// Verify membership
	_, err := h.members.GetByUserAndOrg(r.Context(), session.UserID, req.OrgID)
	if err != nil {
		Error(w, http.StatusForbidden, "not a member of this organization")
		return
	}

	// Load permissions for new org
	perms, err := h.members.GetUserPermissions(r.Context(), session.UserID, req.OrgID)
	if err != nil {
		perms = []string{}
	}

	// Update session
	session.OrgID = req.OrgID
	session.Permissions = perms

	if err := auth.UpdateSession(r.Context(), h.cache, token, session); err != nil {
		Error(w, http.StatusInternalServerError, "failed to update session")
		return
	}

	org, err := h.orgs.GetByID(r.Context(), req.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organization")
		return
	}

	orgName, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)

	JSON(w, http.StatusOK, map[string]any{
		"org": domain.OrgSummary{
			ID:         org.ID,
			Name:       orgName,
			Slug:       org.Slug,
			IsPlatform: org.IsPlatform,
		},
		"permissions": perms,
	})
}

// ListMyOrgs returns all orgs the current user belongs to.
func (h *Handler) ListMyOrgs(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())

	orgs, err := h.members.ListOrgsByUser(r.Context(), session.UserID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organizations")
		return
	}

	result := make([]orgOption, len(orgs))
	for i, o := range orgs {
		name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, o.NameEnc)
		result[i] = orgOption{
			ID:         o.ID,
			Name:       name,
			Slug:       o.Slug,
			IsPlatform: o.IsPlatform,
		}
	}

	JSON(w, http.StatusOK, result)
}
```

**Step 2: Install bcrypt dependency**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go get golang.org/x/crypto/bcrypt
```

**Step 3: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go mod tidy && go build ./...
```

**Step 4: Commit**

```bash
git add routeguard-api/internal/api/ routeguard-api/go.mod routeguard-api/go.sum
git commit -m "feat: add auth handlers - lookup, login, logout, me, switch-org"
```

---

### Task 11: Wire routes in server.go

Connect all auth endpoints in the router.

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Update server.go**

```go
package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/middleware"
)

// PlatformOrgID is the well-known UUID for the RouteGuard platform organization.
const PlatformOrgID = "00000000-0000-0000-0000-000000000001"

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
	r.Use(corsMiddleware(s.cfg))

	h := api.NewHandler(s.pool, s.cache, s.cfg)

	// Health checks
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Public auth (rate-limited)
	r.With(middleware.RateLimit(s.cache, 20)).Post("/auth/lookup", h.Lookup)
	r.With(middleware.RateLimit(s.cache, 20)).Post("/auth/login", h.Login)

	// Authenticated auth
	r.With(middleware.Authenticate(s.cache)).Post("/auth/logout", h.Logout)
	r.With(middleware.Authenticate(s.cache)).Get("/auth/me", h.Me)
	r.With(middleware.Authenticate(s.cache)).Post("/auth/switch-org", h.SwitchOrg)
	r.With(middleware.Authenticate(s.cache)).Get("/auth/orgs", h.ListMyOrgs)

	return r
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func corsMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == cfg.BaseURL || origin == "http://localhost:3000" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

**Step 2: Verify build**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./cmd/api
```

**Step 3: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire auth routes in server router"
```

---

### Task 12: Dashboard - auth proxy routes and API client

Create the Next.js auth proxy routes (login/logout) and update the API client with auth types and methods.

**Files:**
- Create: `dashboard/app/api/auth/login/route.ts`
- Create: `dashboard/app/api/auth/logout/route.ts`
- Modify: `dashboard/lib/api.ts`
- Create: `dashboard/lib/server-api.ts`

**Step 1: Create login proxy route**

```typescript
// dashboard/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  const response = NextResponse.json(data, { status: res.status })

  // Forward the Set-Cookie header from the API
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    response.headers.set('set-cookie', setCookie)
  }

  return response
}
```

**Step 2: Create logout proxy route**

```typescript
// dashboard/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get('rg_session')

  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: cookie ? { Cookie: `rg_session=${cookie.value}` } : {},
  })

  const response = new NextResponse(null, { status: 204 })

  // Clear the cookie
  response.cookies.set('rg_session', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  return response
}
```

**Step 3: Update API client**

```typescript
// dashboard/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const AUTH_BASE = ''

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

  if (typeof window === 'undefined') {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      const session = cookieStore.get('rg_session')
      if (session) {
        reqHeaders['Cookie'] = `rg_session=${session.value}`
      }
    } catch {
      // Not in a Next.js server context
    }
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

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    credentials: 'include',
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

// Types
export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface OrgOption {
  id: string
  name: string
  slug: string
  is_platform: boolean
}

export interface LoginResponse {
  user: AuthUser
  orgs: OrgOption[]
}

export interface AuthMethodsResponse {
  has_password: boolean
  sso_options: SSOOption[]
}

export interface SSOOption {
  connection_id: string
  type: string
  display_name: string
  org_slug: string
  org_name: string
}

export interface MeResponse {
  user: AuthUser
  active_org: OrgOption
  permissions: string[]
}

// API methods
export const api = {
  auth: {
    lookup: (email: string) =>
      authRequest<AuthMethodsResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    login: (email: string, password: string) =>
      authRequest<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () => authRequest<void>('/api/auth/logout', { method: 'POST' }),
    me: () => request<MeResponse>('/auth/me'),
    switchOrg: (orgId: string) =>
      request<{ org: OrgOption; permissions: string[] }>('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ org_id: orgId }),
      }),
    orgs: () => request<OrgOption[]>('/auth/orgs'),
  },
}
```

Note: The `lookup` call above incorrectly hits `/api/auth/login` - it should hit `/auth/lookup` on the Go API. The executor should create a separate proxy or call the API directly. Fix during implementation:

- `lookup` should call `request<AuthMethodsResponse>('/auth/lookup', { method: 'POST', body: JSON.stringify({ email }) })`

**Step 4: Create server-api.ts**

```typescript
// dashboard/lib/server-api.ts
import { cookies } from 'next/headers'
import type { MeResponse } from './api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function getServerUser(): Promise<MeResponse | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('rg_session')
  if (!session) return null

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Cookie: `rg_session=${session.value}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
```

**Step 5: Verify build**

```bash
cd B:/.dev/RouteGuard/dashboard && npm run build
```

**Step 6: Commit**

```bash
git add dashboard/app/api/auth/ dashboard/lib/api.ts dashboard/lib/server-api.ts
git commit -m "feat: add auth proxy routes and typed API client"
```

---

### Task 13: Dashboard - login page

Create the unified `/login` page with email-first detection, password form, and SSO buttons.

**Files:**
- Create: `dashboard/app/login/page.tsx`
- Create: `dashboard/components/auth/login-form.tsx`
- Modify: `dashboard/middleware.ts` (add auth redirect)

**Step 1: Create login form component**

The executor should build a `dashboard/components/auth/login-form.tsx` component with the following UX flow:

1. **Email step**: Single email input + "Continue" button. Calls `POST /auth/lookup` with the email.
2. **Auth method step**: Based on the response:
   - If `has_password` is true, show a password input + "Sign in" button
   - If `sso_options` has entries, show SSO buttons (one per connection, labeled with `display_name`)
   - If both, show password form AND SSO buttons
   - If neither (user not found), show "No account found" message
3. **Org selector step** (after successful login): If the login response contains multiple orgs, show a list to pick from. If just one, redirect straight to `/dashboard`.

Use shadcn/ui components: `Card`, `Input`, `Button`, `Label`. Use `sonner` for error toasts. Use React state to track the current step (`'email' | 'auth' | 'org-select'`).

The component should be a client component (`'use client'`).

**Step 2: Create login page**

```tsx
// dashboard/app/login/page.tsx
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginForm />
    </div>
  )
}
```

**Step 3: Update middleware.ts**

Add auth redirect for `/dashboard` paths:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  const isDev = process.env.NODE_ENV === 'development'

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    isDev
      ? "connect-src 'self' http://localhost:* ws://localhost:*"
      : "connect-src 'self' https://api.route-guard.com wss://api.route-guard.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)

  // Soft auth redirect for protected routes
  const session = request.cookies.get('rg_session')
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
```

**Step 4: Verify build**

```bash
cd B:/.dev/RouteGuard/dashboard && npm run lint && npm run build
```

**Step 5: Commit**

```bash
git add dashboard/app/login/ dashboard/components/auth/ dashboard/middleware.ts
git commit -m "feat: add unified login page with email-first auth detection"
```

---

### Task 14: Dashboard - empty dashboard shell with org switcher

Create the authenticated dashboard layout with an org switcher in the nav.

**Files:**
- Create: `dashboard/app/dashboard/layout.tsx`
- Create: `dashboard/app/dashboard/page.tsx`
- Create: `dashboard/components/dashboard/org-switcher.tsx`

**Step 1: Create dashboard layout**

The executor should create `dashboard/app/dashboard/layout.tsx` as a server component that:
1. Calls `getServerUser()` from `lib/server-api.ts`
2. If no user, redirects to `/login`
3. Renders a simple app shell with a header containing the org name and an `OrgSwitcher` component
4. Renders `{children}` in the main content area

**Step 2: Create org switcher component**

The executor should create `dashboard/components/dashboard/org-switcher.tsx` as a client component that:
1. Fetches the user's orgs via `api.auth.orgs()`
2. Shows a dropdown (shadcn `DropdownMenu`) with the current org highlighted
3. On selection, calls `api.auth.switchOrg(orgId)` and refreshes the page via `router.refresh()`

**Step 3: Create dashboard home page**

```tsx
// dashboard/app/dashboard/page.tsx
export default function DashboardHome() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Welcome to RouteGuard.</p>
    </div>
  )
}
```

**Step 4: Verify build**

```bash
cd B:/.dev/RouteGuard/dashboard && npm run lint && npm run build
```

**Step 5: Commit**

```bash
git add dashboard/app/dashboard/ dashboard/components/dashboard/
git commit -m "feat: add dashboard shell with org switcher"
```

---

### Task 15: Verify full stack

**Step 1: Build Go API**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go build ./cmd/api
```

**Step 2: Run Go tests**

```bash
cd B:/.dev/RouteGuard/routeguard-api && go test -v ./internal/crypto/
```

**Step 3: Lint and build dashboard**

```bash
cd B:/.dev/RouteGuard/dashboard && npm run lint && npm run build
```

**Step 4: Fix any issues found**

If any build or test failures, fix them before proceeding.

**Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build issues from auth system integration"
```

---

## Notes for executor

- **SSO (OIDC/SAML) handlers are NOT included in this plan** - they require the `coreos/go-oidc` and `crewjam/saml` dependencies and are a separate body of work. The data model and SSO repo are in place; the actual OIDC init/callback and SAML init/ACS handlers should be a follow-up plan.
- **The platform org CRUD endpoints (`/platform/orgs`) are NOT included** - they follow the same pattern as the existing handlers and should be added once the core auth is working.
- **The org-scoped member/role/SSO CRUD endpoints (`/org/*`) are NOT included** - same reasoning, follow-up plan.
- The migration seeds a platform org with a well-known UUID (`00000000-...0001`). The first platform user must be created manually (via SQL or a seed script) and assigned the Owner role.
- **Task 13 (login form component)** is described at the UX level rather than with exact code because the UI involves significant interaction design. The executor should use shadcn/ui components and follow the described flow.
