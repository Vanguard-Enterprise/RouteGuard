# Org Settings Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an org settings page at `/dashboard/settings` with tabs for General, Members, SSO, Billing, and Integrations.

**Architecture:** New `/org/*` API route group with session-based org resolution and per-route RBAC. New `integrations` table with encrypted credentials. Frontend proxies through `/api/org/[...path]` catch-all route. Reuses existing repos (SSO, billing, membership, roles) and adds only `IntegrationRepo`.

**Tech Stack:** Go 1.24, chi router, pgx, AES-256-GCM encryption, Next.js 16, React 19, TypeScript, shadcn/ui, SWR, Sonner toasts

**Spec:** `docs/superpowers/specs/2026-03-12-org-settings-design.md`

---

## Chunk 1: Backend Foundation

### Task 1: Create integrations migration

**Files:**
- Create: `routeguard-api/migrations/003_create_integrations.up.sql`
- Create: `routeguard-api/migrations/003_create_integrations.down.sql`

- [ ] **Step 1: Write up migration**

```sql
-- 003_create_integrations.up.sql
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key_enc TEXT,
    api_secret_enc TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    sync_schedule TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_org_id ON integrations(org_id);
```

- [ ] **Step 2: Write down migration**

```sql
-- 003_create_integrations.down.sql
DROP TABLE IF EXISTS integrations;
```

- [ ] **Step 3: Verify migration applies**

Run: `cd routeguard-api && go test -v -run TestMigrations ./... 2>&1 || echo "no migration test - verify manually"`

- [ ] **Step 4: Commit**

```bash
git add routeguard-api/migrations/003_create_integrations.up.sql routeguard-api/migrations/003_create_integrations.down.sql
git commit -m "feat: add integrations table migration"
```

---

### Task 2: Add Integration domain type

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`

- [ ] **Step 1: Add Integration struct**

Add after the existing `OrgBilling` struct in `internal/domain/types.go`:

```go
type Integration struct {
	ID           string     `json:"id"`
	OrgID        string     `json:"org_id"`
	Type         string     `json:"type"`
	DisplayName  string     `json:"display_name"`
	BaseURL      string     `json:"base_url"`
	APIKeyEnc    string     `json:"-"`
	APISecretEnc string     `json:"-"`
	HasAPIKey    bool       `json:"has_api_key"`
	HasAPISecret bool       `json:"has_api_secret"`
	Enabled      bool       `json:"enabled"`
	SyncSchedule *string    `json:"sync_schedule"`
	LastSyncedAt *time.Time `json:"last_synced_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git commit -m "feat: add Integration domain type"
```

---

### Task 3: Create IntegrationRepo

**Files:**
- Create: `routeguard-api/internal/repository/integration_repo.go`

- [ ] **Step 1: Write the repository**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type IntegrationRepo struct {
	pool *pgxpool.Pool
}

func NewIntegrationRepo(pool *pgxpool.Pool) *IntegrationRepo {
	return &IntegrationRepo{pool: pool}
}

func (r *IntegrationRepo) Create(ctx context.Context, i *domain.Integration) (*domain.Integration, error) {
	var out domain.Integration
	err := r.pool.QueryRow(ctx,
		`INSERT INTO integrations (org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at`,
		i.OrgID, i.Type, i.DisplayName, i.BaseURL, i.APIKeyEnc, i.APISecretEnc, i.Enabled,
	).Scan(&out.ID, &out.OrgID, &out.Type, &out.DisplayName, &out.BaseURL, &out.APIKeyEnc, &out.APISecretEnc,
		&out.Enabled, &out.SyncSchedule, &out.LastSyncedAt, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create integration: %w", err)
	}
	out.HasAPIKey = out.APIKeyEnc != ""
	out.HasAPISecret = out.APISecretEnc != ""
	return &out, nil
}

func (r *IntegrationRepo) GetByID(ctx context.Context, id string) (*domain.Integration, error) {
	var out domain.Integration
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at
		 FROM integrations WHERE id = $1`, id,
	).Scan(&out.ID, &out.OrgID, &out.Type, &out.DisplayName, &out.BaseURL, &out.APIKeyEnc, &out.APISecretEnc,
		&out.Enabled, &out.SyncSchedule, &out.LastSyncedAt, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get integration: %w", err)
	}
	out.HasAPIKey = out.APIKeyEnc != ""
	out.HasAPISecret = out.APISecretEnc != ""
	return &out, nil
}

func (r *IntegrationRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.Integration, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at
		 FROM integrations WHERE org_id = $1 ORDER BY created_at`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list integrations: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Integration, 0)
	for rows.Next() {
		var i domain.Integration
		if err := rows.Scan(&i.ID, &i.OrgID, &i.Type, &i.DisplayName, &i.BaseURL, &i.APIKeyEnc, &i.APISecretEnc,
			&i.Enabled, &i.SyncSchedule, &i.LastSyncedAt, &i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan integration: %w", err)
		}
		i.HasAPIKey = i.APIKeyEnc != ""
		i.HasAPISecret = i.APISecretEnc != ""
		items = append(items, i)
	}
	return items, nil
}

func (r *IntegrationRepo) Update(ctx context.Context, i *domain.Integration) (*domain.Integration, error) {
	var out domain.Integration
	err := r.pool.QueryRow(ctx,
		`UPDATE integrations SET type = $2, display_name = $3, base_url = $4, api_key_enc = $5, api_secret_enc = $6, enabled = $7, updated_at = now()
		 WHERE id = $1
		 RETURNING id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at`,
		i.ID, i.Type, i.DisplayName, i.BaseURL, i.APIKeyEnc, i.APISecretEnc, i.Enabled,
	).Scan(&out.ID, &out.OrgID, &out.Type, &out.DisplayName, &out.BaseURL, &out.APIKeyEnc, &out.APISecretEnc,
		&out.Enabled, &out.SyncSchedule, &out.LastSyncedAt, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update integration: %w", err)
	}
	out.HasAPIKey = out.APIKeyEnc != ""
	out.HasAPISecret = out.APISecretEnc != ""
	return &out, nil
}

func (r *IntegrationRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM integrations WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete integration: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/repository/integration_repo.go
git commit -m "feat: add IntegrationRepo with CRUD operations"
```

---

### Task 4: Add IntegrationRepo to Handler struct

**Files:**
- Modify: `routeguard-api/internal/api/handler.go`

- [ ] **Step 1: Add integrations field to Handler struct**

Add `integrations *repository.IntegrationRepo` after the `billing` field in the Handler struct (around line 19).

- [ ] **Step 2: Add initialization in NewHandler**

Add `integrations: repository.NewIntegrationRepo(pool),` after the `billing:` line in NewHandler (around line 32).

- [ ] **Step 3: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add routeguard-api/internal/api/handler.go
git commit -m "feat: add IntegrationRepo to Handler struct"
```

---

### Task 5: Create org settings handler (General tab)

**Files:**
- Create: `routeguard-api/internal/api/org_settings_handler.go`

- [ ] **Step 1: Write the handler**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgGetSettings(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	org, err := h.orgs.GetByID(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organization")
		return
	}
	h.decryptOrgName(org)
	JSON(w, http.StatusOK, org)
}

func (h *Handler) OrgUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		Error(w, http.StatusBadRequest, "name is required")
		return
	}

	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	// Get current org to preserve slug
	current, err := h.orgs.GetByID(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load organization")
		return
	}

	nameEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}

	org, err := h.orgs.Update(ctx, session.OrgID, nameEnc, current.Slug)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update organization")
		return
	}
	org.Name = body.Name
	JSON(w, http.StatusOK, org)
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/api/org_settings_handler.go
git commit -m "feat: add org settings handlers (General tab)"
```

---

### Task 6: Create org member handler (Members tab)

**Files:**
- Create: `routeguard-api/internal/api/org_member_handler.go`

The org-level member handlers are similar to the platform handlers but scoped to the session's active org. Key differences: (1) org ID comes from session, not URL param, (2) RBAC is enforced via middleware, (3) delete guards against removing the last org:manage member.

- [ ] **Step 1: Write the handler**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgListMembers(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	ctx := r.Context()

	memberships, err := h.members.ListMembersByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list members")
		return
	}

	type memberRole struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	type enrichedMember struct {
		UserID string       `json:"user_id"`
		Email  string       `json:"email"`
		Name   string       `json:"name"`
		Roles  []memberRole `json:"roles"`
	}

	result := make([]enrichedMember, 0, len(memberships))
	for _, m := range memberships {
		user, err := h.users.GetByID(ctx, m.UserID)
		if err != nil {
			continue
		}
		email, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.EmailEnc)
		name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, user.NameEnc)

		roles, _ := h.roles.ListMemberRoles(ctx, m.ID)
		memberRoles := make([]memberRole, 0, len(roles))
		for _, role := range roles {
			memberRoles = append(memberRoles, memberRole{ID: role.ID, Name: role.Name})
		}

		result = append(result, enrichedMember{
			UserID: m.UserID,
			Email:  email,
			Name:   name,
			Roles:  memberRoles,
		})
	}

	JSON(w, http.StatusOK, result)
}

func (h *Handler) OrgCreateMember(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Email == "" || body.Name == "" {
		Error(w, http.StatusBadRequest, "email and name are required")
		return
	}

	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	emailEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Email)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}
	nameEnc, err := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Name)
	if err != nil {
		Error(w, http.StatusInternalServerError, "encryption failed")
		return
	}
	emailHash := crypto.HMAC(h.cfg.HMACKey, body.Email)

	user, err := h.users.Create(ctx, emailEnc, emailHash, nameEnc, nil)
	if err != nil {
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "a user with this email already exists")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	_, err = h.members.Create(ctx, user.ID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	user.Email = body.Email
	user.Name = body.Name
	JSON(w, http.StatusCreated, user)
}

func (h *Handler) OrgInviteMember(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Email == "" {
		Error(w, http.StatusBadRequest, "email is required")
		return
	}

	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	// Check if user already exists
	emailHash := crypto.HMAC(h.cfg.HMACKey, body.Email)
	existing, err := h.users.GetByEmailHash(ctx, emailHash)
	if err == nil && existing != nil {
		// User exists - just add to org
		_, err = h.members.Create(ctx, existing.ID, session.OrgID)
		if err != nil {
			if isUniqueViolation(err) {
				Error(w, http.StatusConflict, "user is already a member")
				return
			}
			Error(w, http.StatusInternalServerError, "failed to add member")
			return
		}
		NoContent(w)
		return
	}

	// Create user with no password
	emailEnc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Email)
	nameEnc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, body.Email) // Use email as placeholder name

	user, err := h.users.Create(ctx, emailEnc, emailHash, nameEnc, nil)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	_, err = h.members.Create(ctx, user.ID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	NoContent(w)
}

func (h *Handler) OrgRemoveMember(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	membership, err := h.members.GetByUserAndOrg(ctx, userID, session.OrgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	// Guard: check if this is the last member with org:manage
	roles, _ := h.roles.ListMemberRoles(ctx, membership.ID)
	hasManage := false
	for _, role := range roles {
		for _, p := range role.Permissions {
			if p == "org:manage" {
				hasManage = true
				break
			}
		}
	}

	if hasManage {
		// Check if there are other members with org:manage
		allMembers, _ := h.members.ListMembersByOrg(ctx, session.OrgID)
		manageCount := 0
		for _, m := range allMembers {
			if m.ID == membership.ID {
				continue
			}
			mRoles, _ := h.roles.ListMemberRoles(ctx, m.ID)
			for _, role := range mRoles {
				for _, p := range role.Permissions {
					if p == "org:manage" {
						manageCount++
					}
				}
			}
		}
		if manageCount == 0 {
			Error(w, http.StatusConflict, "cannot remove the last member with org management permissions")
			return
		}
	}

	if err := h.members.Delete(ctx, membership.ID); err != nil {
		Error(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	NoContent(w)
}

func (h *Handler) OrgUpdateMemberRoles(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		RoleIDs []string `json:"role_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	membership, err := h.members.GetByUserAndOrg(ctx, userID, session.OrgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "membership not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to find membership")
		return
	}

	// Remove existing roles
	existingRoles, _ := h.roles.ListMemberRoles(ctx, membership.ID)
	for _, role := range existingRoles {
		_ = h.roles.UnassignFromMember(ctx, membership.ID, role.ID)
	}

	// Assign new roles
	for _, roleID := range body.RoleIDs {
		if err := h.roles.AssignToMember(ctx, membership.ID, roleID); err != nil {
			Error(w, http.StatusInternalServerError, "failed to assign role")
			return
		}
	}

	NoContent(w)
}

func (h *Handler) OrgListRoles(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	roles, err := h.roles.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list roles")
		return
	}
	JSON(w, http.StatusOK, roles)
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build. Note: `isNotFound` and `isUniqueViolation` helpers already exist in the `api` package.

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/api/org_member_handler.go
git commit -m "feat: add org member handlers with last-admin guard"
```

---

### Task 7: Create org SSO handler

**Files:**
- Create: `routeguard-api/internal/api/org_sso_handler.go`

Uses the existing `SSORepo`. Handlers verify ownership (`connection.OrgID == session.OrgID`) on update/delete. Encrypts secrets before storage, never returns them in responses.

- [ ] **Step 1: Write the handler**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgListSSO(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	conns, err := h.sso.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list SSO connections")
		return
	}
	JSON(w, http.StatusOK, conns)
}

func (h *Handler) OrgCreateSSO(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Type            string  `json:"type"`
		DisplayName     string  `json:"display_name"`
		Enabled         bool    `json:"enabled"`
		OIDCIssuerURL   *string `json:"oidc_issuer_url"`
		OIDCClientID    *string `json:"oidc_client_id"`
		OIDCClientSecret *string `json:"oidc_client_secret"`
		OIDCScopes      *string `json:"oidc_scopes"`
		SAMLEntityID    *string `json:"saml_entity_id"`
		SAMLSSOURL      *string `json:"saml_sso_url"`
		SAMLCertificate *string `json:"saml_certificate"`
		SAMLMetadataURL *string `json:"saml_metadata_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" || body.DisplayName == "" {
		Error(w, http.StatusBadRequest, "type and display_name are required")
		return
	}
	if body.Type != "saml" && body.Type != "oidc" {
		Error(w, http.StatusBadRequest, "type must be saml or oidc")
		return
	}

	session := middleware.SessionFromContext(r.Context())

	conn := &domain.SSOConnection{
		OrgID:           session.OrgID,
		Type:            body.Type,
		DisplayName:     body.DisplayName,
		Enabled:         body.Enabled,
		OIDCIssuerURL:   body.OIDCIssuerURL,
		OIDCClientID:    body.OIDCClientID,
		OIDCScopes:      body.OIDCScopes,
		SAMLEntityID:    body.SAMLEntityID,
		SAMLSSOURL:      body.SAMLSSOURL,
		SAMLMetadataURL: body.SAMLMetadataURL,
	}

	if body.OIDCClientSecret != nil && *body.OIDCClientSecret != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.OIDCClientSecret)
		conn.OIDCClientSecretEnc = &enc
	}
	if body.SAMLCertificate != nil && *body.SAMLCertificate != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.SAMLCertificate)
		conn.SAMLCertificateEnc = &enc
	}

	created, err := h.sso.Create(r.Context(), conn)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create SSO connection")
		return
	}
	JSON(w, http.StatusCreated, created)
}

func (h *Handler) OrgUpdateSSO(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	existing, err := h.sso.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get SSO connection")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	var body struct {
		DisplayName      *string `json:"display_name"`
		Enabled          *bool   `json:"enabled"`
		OIDCIssuerURL    *string `json:"oidc_issuer_url"`
		OIDCClientID     *string `json:"oidc_client_id"`
		OIDCClientSecret *string `json:"oidc_client_secret"`
		OIDCScopes       *string `json:"oidc_scopes"`
		SAMLEntityID     *string `json:"saml_entity_id"`
		SAMLSSOURL       *string `json:"saml_sso_url"`
		SAMLCertificate  *string `json:"saml_certificate"`
		SAMLMetadataURL  *string `json:"saml_metadata_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.DisplayName != nil {
		existing.DisplayName = *body.DisplayName
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}
	if body.OIDCIssuerURL != nil {
		existing.OIDCIssuerURL = body.OIDCIssuerURL
	}
	if body.OIDCClientID != nil {
		existing.OIDCClientID = body.OIDCClientID
	}
	if body.OIDCScopes != nil {
		existing.OIDCScopes = body.OIDCScopes
	}
	if body.SAMLEntityID != nil {
		existing.SAMLEntityID = body.SAMLEntityID
	}
	if body.SAMLSSOURL != nil {
		existing.SAMLSSOURL = body.SAMLSSOURL
	}
	if body.SAMLMetadataURL != nil {
		existing.SAMLMetadataURL = body.SAMLMetadataURL
	}
	if body.OIDCClientSecret != nil && *body.OIDCClientSecret != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.OIDCClientSecret)
		existing.OIDCClientSecretEnc = &enc
	}
	if body.SAMLCertificate != nil && *body.SAMLCertificate != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.SAMLCertificate)
		existing.SAMLCertificateEnc = &enc
	}

	updated, err := h.sso.Update(ctx, existing)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update SSO connection")
		return
	}
	JSON(w, http.StatusOK, updated)
}

func (h *Handler) OrgDeleteSSO(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	existing, err := h.sso.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "SSO connection not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get SSO connection")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "SSO connection not found")
		return
	}

	if err := h.sso.Delete(ctx, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete SSO connection")
		return
	}
	NoContent(w)
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/api/org_sso_handler.go
git commit -m "feat: add org SSO handlers with ownership verification"
```

---

### Task 8: Create org billing handler

**Files:**
- Create: `routeguard-api/internal/api/org_billing_handler.go`

- [ ] **Step 1: Write the handler**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgGetBilling(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	billing, err := h.billing.GetOrCreateByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load billing")
		return
	}
	JSON(w, http.StatusOK, billing)
}

func (h *Handler) OrgUpdateBillingContact(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BillingContactEmail string `json:"billing_contact_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.BillingContactEmail == "" {
		Error(w, http.StatusBadRequest, "billing_contact_email is required")
		return
	}

	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	// Get current billing to preserve other fields
	current, err := h.billing.GetOrCreateByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load billing")
		return
	}

	updated, err := h.billing.Update(ctx, session.OrgID, current.BillingStatus, current.PilotEndsAt, current.ContractNotes, body.BillingContactEmail)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update billing contact")
		return
	}
	JSON(w, http.StatusOK, updated)
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/api/org_billing_handler.go
git commit -m "feat: add org billing handlers (read-only except contact email)"
```

---

### Task 9: Create org integration handler

**Files:**
- Create: `routeguard-api/internal/api/org_integration_handler.go`

- [ ] **Step 1: Write the handler**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgListIntegrations(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	items, err := h.integrations.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list integrations")
		return
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) OrgCreateIntegration(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Type        string `json:"type"`
		DisplayName string `json:"display_name"`
		BaseURL     string `json:"base_url"`
		APIKey      string `json:"api_key"`
		APISecret   string `json:"api_secret"`
		Enabled     bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" || body.DisplayName == "" || body.BaseURL == "" {
		Error(w, http.StatusBadRequest, "type, display_name, and base_url are required")
		return
	}

	session := middleware.SessionFromContext(r.Context())

	integration := &domain.Integration{
		OrgID:       session.OrgID,
		Type:        body.Type,
		DisplayName: body.DisplayName,
		BaseURL:     body.BaseURL,
		Enabled:     body.Enabled,
	}

	if body.APIKey != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, body.APIKey)
		integration.APIKeyEnc = enc
	}
	if body.APISecret != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, body.APISecret)
		integration.APISecretEnc = enc
	}

	created, err := h.integrations.Create(r.Context(), integration)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create integration")
		return
	}
	JSON(w, http.StatusCreated, created)
}

func (h *Handler) OrgUpdateIntegration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	existing, err := h.integrations.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "integration not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get integration")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "integration not found")
		return
	}

	var body struct {
		DisplayName *string `json:"display_name"`
		BaseURL     *string `json:"base_url"`
		APIKey      *string `json:"api_key"`
		APISecret   *string `json:"api_secret"`
		Enabled     *bool   `json:"enabled"`
		Type        *string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.DisplayName != nil {
		existing.DisplayName = *body.DisplayName
	}
	if body.BaseURL != nil {
		existing.BaseURL = *body.BaseURL
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}
	if body.Type != nil {
		existing.Type = *body.Type
	}
	if body.APIKey != nil && *body.APIKey != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.APIKey)
		existing.APIKeyEnc = enc
	}
	if body.APISecret != nil && *body.APISecret != "" {
		enc, _ := crypto.Encrypt(h.cfg.DataEncryptionKey, *body.APISecret)
		existing.APISecretEnc = enc
	}

	updated, err := h.integrations.Update(ctx, existing)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update integration")
		return
	}
	JSON(w, http.StatusOK, updated)
}

func (h *Handler) OrgDeleteIntegration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	existing, err := h.integrations.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "integration not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get integration")
		return
	}
	if existing.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "integration not found")
		return
	}

	if err := h.integrations.Delete(ctx, id); err != nil {
		Error(w, http.StatusInternalServerError, "failed to delete integration")
		return
	}
	NoContent(w)
}
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/api/org_integration_handler.go
git commit -m "feat: add org integration handlers with ownership verification"
```

---

### Task 10: Wire org routes in server.go

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

- [ ] **Step 1: Add the /org route group**

Add after the `/platform` route group block (after line 98, before `return r`):

```go
	// Org-level routes (session-scoped)
	r.Route("/org", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache, s.pool))

		// General
		r.Get("/settings", h.OrgGetSettings)
		r.With(middleware.RequirePermission("org:manage")).Put("/settings", h.OrgUpdateSettings)

		// Members
		r.With(middleware.RequirePermission("members:read")).Get("/members", h.OrgListMembers)
		r.With(middleware.RequirePermission("members:write")).Post("/members", h.OrgCreateMember)
		r.With(middleware.RequirePermission("members:write")).Post("/members/invite", h.OrgInviteMember)
		r.With(middleware.RequirePermission("members:write")).Delete("/members/{userId}", h.OrgRemoveMember)
		r.With(middleware.RequirePermission("roles:write")).Put("/members/{userId}/roles", h.OrgUpdateMemberRoles)
		r.With(middleware.RequirePermission("roles:read")).Get("/roles", h.OrgListRoles)

		// SSO
		r.With(middleware.RequirePermission("sso:read")).Get("/sso", h.OrgListSSO)
		r.With(middleware.RequirePermission("sso:write")).Post("/sso", h.OrgCreateSSO)
		r.With(middleware.RequirePermission("sso:write")).Put("/sso/{id}", h.OrgUpdateSSO)
		r.With(middleware.RequirePermission("sso:write")).Delete("/sso/{id}", h.OrgDeleteSSO)

		// Billing
		r.Get("/billing", h.OrgGetBilling)
		r.With(middleware.RequirePermission("org:manage")).Put("/billing/contact", h.OrgUpdateBillingContact)

		// Integrations
		r.Get("/integrations", h.OrgListIntegrations)
		r.With(middleware.RequirePermission("org:manage")).Post("/integrations", h.OrgCreateIntegration)
		r.With(middleware.RequirePermission("org:manage")).Put("/integrations/{id}", h.OrgUpdateIntegration)
		r.With(middleware.RequirePermission("org:manage")).Delete("/integrations/{id}", h.OrgDeleteIntegration)
	})
```

- [ ] **Step 2: Build to verify**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire org routes with RBAC permissions"
```

---

## Chunk 2: Frontend Foundation

### Task 11: Create org API proxy route

**Files:**
- Create: `dashboard/app/api/org/[...path]/route.ts`

Copy the pattern from `dashboard/app/api/platform/[...path]/route.ts` but change the target prefix from `/platform/` to `/org/`.

- [ ] **Step 1: Write the proxy**

```typescript
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const target = `/org/${path.join('/')}`
  const url = `${API_BASE}${target}${request.nextUrl.search}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const cookie = request.cookies.get('rg_session')
  if (cookie) {
    headers['Cookie'] = `rg_session=${cookie.value}`
  }

  const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.text()
    : undefined

  const res = await fetch(url, {
    method: request.method,
    headers,
    body,
  })

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 })
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
export const PATCH = proxyRequest
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/app/api/org/\[...path\]/route.ts
git commit -m "feat: add org API proxy route for cookie forwarding"
```

---

### Task 12: Add org types and API methods to lib/api.ts

**Files:**
- Modify: `dashboard/lib/api.ts`

- [ ] **Step 1: Add new types**

Add after the existing `CursorResponse` type (around line 216):

```typescript
export interface SSOConnection {
  id: string
  org_id: string
  type: "saml" | "oidc"
  display_name: string
  enabled: boolean
  oidc_issuer_url?: string
  oidc_client_id?: string
  oidc_scopes?: string
  saml_entity_id?: string
  saml_sso_url?: string
  saml_metadata_url?: string
  created_at: string
  updated_at: string
}

export interface Integration {
  id: string
  org_id: string
  type: string
  display_name: string
  base_url: string
  has_api_key: boolean
  has_api_secret: boolean
  enabled: boolean
  sync_schedule: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface OrgMember {
  user_id: string
  email: string
  name: string
  roles: { id: string; name: string }[]
}

export interface OrgRole {
  id: string
  name: string
  permissions: string[]
  is_system: boolean
}
```

- [ ] **Step 2: Add orgRequest function**

Add after the existing `platformRequest` function (around line 54):

```typescript
async function orgRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window !== 'undefined') {
    return clientRequest<T>(`/api${path}`, init)
  }
  return request<T>(path, init)
}
```

- [ ] **Step 3: Add api.org namespace**

Add after the `platform` block in the `api` object (before the closing `}`):

```typescript
  org: {
    settings: {
      get: () => orgRequest<Organization>('/org/settings'),
      update: (data: { name: string }) =>
        orgRequest<Organization>('/org/settings', { method: 'PUT', body: JSON.stringify(data) }),
    },
    members: {
      list: () => orgRequest<OrgMember[]>('/org/members'),
      create: (data: { email: string; name: string }) =>
        orgRequest<PlatformUser>('/org/members', { method: 'POST', body: JSON.stringify(data) }),
      invite: (email: string) =>
        orgRequest<void>('/org/members/invite', { method: 'POST', body: JSON.stringify({ email }) }),
      remove: (userId: string) =>
        orgRequest<void>(`/org/members/${userId}`, { method: 'DELETE' }),
      updateRoles: (userId: string, roleIds: string[]) =>
        orgRequest<void>(`/org/members/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ role_ids: roleIds }) }),
    },
    roles: {
      list: () => orgRequest<OrgRole[]>('/org/roles'),
    },
    sso: {
      list: () => orgRequest<SSOConnection[]>('/org/sso'),
      create: (data: Partial<SSOConnection> & { oidc_client_secret?: string; saml_certificate?: string }) =>
        orgRequest<SSOConnection>('/org/sso', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<SSOConnection> & { oidc_client_secret?: string; saml_certificate?: string }) =>
        orgRequest<SSOConnection>(`/org/sso/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        orgRequest<void>(`/org/sso/${id}`, { method: 'DELETE' }),
    },
    billing: {
      get: () => orgRequest<OrgBilling>('/org/billing'),
      updateContact: (email: string) =>
        orgRequest<void>('/org/billing/contact', { method: 'PUT', body: JSON.stringify({ billing_contact_email: email }) }),
    },
    integrations: {
      list: () => orgRequest<Integration[]>('/org/integrations'),
      create: (data: { type: string; display_name: string; base_url: string; api_key?: string; api_secret?: string; enabled?: boolean }) =>
        orgRequest<Integration>('/org/integrations', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { display_name?: string; base_url?: string; api_key?: string; api_secret?: string; enabled?: boolean; type?: string }) =>
        orgRequest<Integration>(`/org/integrations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        orgRequest<void>(`/org/integrations/${id}`, { method: 'DELETE' }),
    },
  },
```

- [ ] **Step 4: Build to verify**

Run: `cd dashboard && npm run build`
Expected: clean build

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add org types and API methods to frontend client"
```

---

## Chunk 3: Settings Page UI

### Task 13: Create settings page with General tab

**Files:**
- Create: `dashboard/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Write the settings page with General tab**

```tsx
"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Organization } from "@/lib/api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

function GeneralTab() {
  const { data: org, mutate } = useSWR<Organization>("org-settings", () =>
    api.org.settings.get()
  )
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  function startEdit() {
    if (!org) return
    setName(org.name)
    setEditMode(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await api.org.settings.update({ name })
      toast.success("Organization updated")
      setEditMode(false)
      mutate()
    } catch {
      toast.error("Failed to update organization")
    } finally {
      setSaving(false)
    }
  }

  if (!org) return <div className="text-muted-foreground">Loading...</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editMode ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{org.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Slug</p>
                <p className="font-medium">{org.slug}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{new Date(org.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={startEdit}>
              Edit
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="sso">SSO</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Members management coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sso" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              SSO configuration coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Billing information coming soon
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Integrations coming soon
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Lint and build**

Run: `cd dashboard && npm run lint && npm run build`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/settings/page.tsx
git commit -m "feat: add settings page with General tab"
```

---

### Task 14: Add Members tab

**Files:**
- Modify: `dashboard/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add MembersTab component**

Replace the placeholder `TabsContent` for members with a full `MembersTab` component. This follows the same pattern as the platform org detail page's Members tab but uses `api.org.members` and `api.org.roles`. Features: member table, add member (search existing + create new), role assignment dropdown, remove member.

The component should include:
- SWR fetch of `api.org.members.list()` and `api.org.roles.list()`
- Add member toggle with email search (`api.platform.users.list({ email })`) and create new user form (`api.org.members.create()`)
- Invite by email (`api.org.members.invite()`)
- Remove member (`api.org.members.remove()`)
- Role assignment: for each member, a dropdown/select showing available roles with save (`api.org.members.updateRoles()`)

Import additional shadcn components: `Table, TableHeader, TableBody, TableRow, TableHead, TableCell`, `Select, SelectContent, SelectItem, SelectTrigger, SelectValue`.

- [ ] **Step 2: Lint and build**

Run: `cd dashboard && npm run lint && npm run build`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/settings/page.tsx
git commit -m "feat: add Members tab to settings page"
```

---

### Task 15: Add SSO tab

**Files:**
- Modify: `dashboard/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add SSOTab component**

Replace the placeholder `TabsContent` for SSO with a full `SSOTab` component. Features:
- SWR fetch of `api.org.sso.list()`
- List of SSO connections as cards with type badge (SAML/OIDC), display name, enabled status
- "Add Connection" button toggles a form with: type selector (SAML/OIDC), display name, and conditional fields:
  - OIDC: issuer URL, client ID, client secret, scopes
  - SAML: entity ID, SSO URL, certificate (textarea), metadata URL
- Edit button on each card opens the form pre-filled
- Delete button with confirmation
- Enable/disable toggle per connection

Import `Badge` component for type badges, `Textarea` for certificate input.

- [ ] **Step 2: Lint and build**

Run: `cd dashboard && npm run lint && npm run build`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/settings/page.tsx
git commit -m "feat: add SSO tab to settings page"
```

---

### Task 16: Add Billing tab

**Files:**
- Modify: `dashboard/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add BillingTab component**

Replace the placeholder `TabsContent` for billing with a full `BillingTab` component. Features:
- SWR fetch of `api.org.billing.get()`
- Read-only display: billing status badge (active/pilot/cancelled), pilot end date, contract notes
- Editable billing contact email with inline edit/save pattern
- Use the same `Badge` variants as the platform billing page (`default` for active, `secondary` for pilot, `destructive` for cancelled)

- [ ] **Step 2: Lint and build**

Run: `cd dashboard && npm run lint && npm run build`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/settings/page.tsx
git commit -m "feat: add Billing tab to settings page"
```

---

### Task 17: Add Integrations tab

**Files:**
- Modify: `dashboard/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add IntegrationsTab component**

Replace the placeholder `TabsContent` for integrations with a full `IntegrationsTab` component. Features:
- SWR fetch of `api.org.integrations.list()`
- List of integrations as cards with type badge (PowerSchool), display name, base URL, enabled toggle
- "Add Integration" button toggles a form: type selector (PowerSchool for now), display name, base URL, API key, API secret
- Edit/delete per card with ownership verification on the backend
- Shows "Credentials configured" / "Not configured" indicator based on `has_api_key`/`has_api_secret`
- Shows `last_synced_at` when available (formatted date or "Never")

- [ ] **Step 2: Lint and build**

Run: `cd dashboard && npm run lint && npm run build`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add dashboard/app/dashboard/settings/page.tsx
git commit -m "feat: add Integrations tab to settings page"
```

---

### Task 18: Final build verification and push

- [ ] **Step 1: Build Go API**

Run: `cd routeguard-api && go build ./cmd/api`
Expected: clean build

- [ ] **Step 2: Lint and build dashboard**

Run: `cd dashboard && npm run lint && npm run build`
Expected: clean

- [ ] **Step 3: Push**

```bash
git push origin main
```
