# Org Settings Page Design

## Goal

Build a tabbed settings page at `/dashboard/settings` where org admins can manage their organization's profile, members, SSO connections, billing info, and third-party integrations.

## Architecture

Tabbed settings page using shadcn Tabs. New org-scoped API route group at `/org/*` gated by `Authenticate` middleware plus `RequirePermission` for write operations. The active org comes from the user's session (`session.OrgID`) - no org ID in URLs. Frontend proxies client-side requests through a Next.js catch-all route at `/api/org/[...path]` to forward the `rg_session` cookie (same pattern as `/api/platform/[...path]`).

## Database

### Existing table: `sso_connections` (already exists - no migration needed)

Uses the existing `domain.SSOConnection` type with fields: `id`, `org_id`, `type`, `display_name`, `enabled`, `oidc_issuer_url`, `oidc_client_id`, `oidc_client_secret_enc`, `oidc_scopes`, `saml_entity_id`, `saml_sso_url`, `saml_certificate_enc`, `saml_metadata_url`, `created_at`, `updated_at`.

Existing `repository.SSORepo` provides: `Create`, `GetByID`, `ListByOrg`, `Update`, `Delete`.

### New table: `integrations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `org_id` | UUID FK -> organizations | NOT NULL |
| `type` | text | NOT NULL, "powerschool" initially |
| `display_name` | text | NOT NULL |
| `base_url` | text | NOT NULL |
| `api_key_enc` | text | Encrypted, nullable |
| `api_secret_enc` | text | Encrypted, nullable |
| `enabled` | boolean | NOT NULL DEFAULT true |
| `sync_schedule` | text | nullable (future use) |
| `last_synced_at` | timestamptz | nullable (future use) |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

Index: `idx_integrations_org_id` on `org_id`.

Sensitive fields encrypted with AES-256-GCM using the existing `crypto.Encrypt`/`crypto.Decrypt` pattern and `DataEncryptionKey`.

### Existing tables used

- `organizations` - General tab (name, slug)
- `org_memberships`, `org_roles`, `org_member_roles` - Members tab
- `org_billing` - Billing tab
- `users` - member lookup/creation
- `sso_connections` - SSO tab

### Migration

Single new migration file only:
- `003_create_integrations.up.sql` / `003_create_integrations.down.sql`

The `sso_connections` table already exists from migration 001.

## API Endpoints

All under `/org/*`, requiring authenticated session. Active org resolved from `session.OrgID`.

### General

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/org/settings` | authenticated | Returns org name, slug, created_at |
| `PUT` | `/org/settings` | `org:manage` | Update org name only (slug is read-only) |

`PUT /org/settings` accepts `{ "name": "string" }` only. Slug changes are not permitted through this endpoint to avoid breaking SSO redirect URIs and login URLs at `/login/[slug]`.

### Members

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/org/members` | `members:read` | List members with decrypted name/email and roles |
| `POST` | `/org/members` | `members:write` | Create user and add to org |
| `POST` | `/org/members/invite` | `members:write` | Invite user by email (creates with no password) |
| `DELETE` | `/org/members/{userId}` | `members:write` | Remove member from org |
| `PUT` | `/org/members/{userId}/roles` | `roles:write` | Assign roles to member |
| `GET` | `/org/roles` | `roles:read` | List available roles for the org |

**Safety guard:** `DELETE /org/members/{userId}` must check if the target user is the last member with `org:manage` permission. If so, reject with 409 Conflict to prevent orphaning the org.

### SSO

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/org/sso` | `sso:read` | List SSO connections for this org |
| `POST` | `/org/sso` | `sso:write` | Create SSO connection |
| `PUT` | `/org/sso/{id}` | `sso:write` | Update SSO connection |
| `DELETE` | `/org/sso/{id}` | `sso:write` | Delete SSO connection |

**Ownership check:** `PUT` and `DELETE` handlers must verify `connection.OrgID == session.OrgID` before acting. The existing `SSORepo.GetByID` returns the connection with its `OrgID` - handler compares before proceeding.

SSO connection create/update body (matches existing `domain.SSOConnection` fields):
```json
{
  "type": "saml" | "oidc",
  "display_name": "string",
  "enabled": true,
  "oidc_issuer_url": "string (OIDC only)",
  "oidc_client_id": "string (OIDC only)",
  "oidc_client_secret": "string (OIDC only, plaintext - encrypted before storage)",
  "oidc_scopes": "string (OIDC only, e.g. 'openid profile email')",
  "saml_entity_id": "string (SAML only)",
  "saml_sso_url": "string (SAML only)",
  "saml_certificate": "string (SAML only, plaintext - encrypted before storage)",
  "saml_metadata_url": "string (SAML only)"
}
```

API responses include a `has_client_secret` / `has_certificate` boolean field so the UI can show whether credentials are configured without exposing the actual values.

### Billing

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/org/billing` | authenticated | Returns billing status, pilot end date, contact, notes |
| `PUT` | `/org/billing/contact` | `org:manage` | Update billing contact email only |

### Integrations

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/org/integrations` | authenticated | List configured integrations |
| `POST` | `/org/integrations` | `org:manage` | Add integration config |
| `PUT` | `/org/integrations/{id}` | `org:manage` | Update integration config |
| `DELETE` | `/org/integrations/{id}` | `org:manage` | Remove integration |

**Ownership check:** `PUT` and `DELETE` handlers must verify `integration.OrgID == session.OrgID` before acting.

Integration create/update body:
```json
{
  "type": "powerschool",
  "display_name": "string",
  "base_url": "string",
  "api_key": "string (plaintext - encrypted before storage)",
  "api_secret": "string (plaintext - encrypted before storage)",
  "enabled": true
}
```

API responses include `has_api_key` and `has_api_secret` booleans instead of the actual credential values.

## Go Backend Structure

### New files

- `internal/repository/integration_repo.go` - CRUD for `integrations` table
- `internal/api/org_settings_handler.go` - General settings handlers
- `internal/api/org_member_handler.go` - Org-level member handlers
- `internal/api/org_sso_handler.go` - SSO connection handlers (uses existing `SSORepo`)
- `internal/api/org_billing_handler.go` - Org billing handlers (uses existing `BillingRepo`)
- `internal/api/org_integration_handler.go` - Integration handlers

### Existing files used (no changes needed to repos)

- `internal/repository/sso_repo.go` - Already has all needed CRUD methods
- `internal/repository/membership_repo.go` - Already has `ListMembersByOrg`, `Create`, `Delete`, `GetByUserAndOrg`
- `internal/repository/org_repo.go` - Already has `GetByID`, `Update`
- `internal/repository/billing_repo.go` - Already has `GetOrCreateByOrg`

### New domain type in `internal/domain/types.go`

Only `Integration` is new. `SSOConnection` already exists.

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

### Route wiring in `server.go`

New route group under `/org` with `Authenticate` middleware and per-route `RequirePermission`:

```go
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

Handlers extract the active org ID from `middleware.SessionFromContext(ctx).OrgID`.

### Handler struct additions

Add only `integrations *repository.IntegrationRepo` to `Handler` struct and `NewHandler` constructor. `sso` is already present.

## Frontend Structure

### New files

- `app/dashboard/settings/page.tsx` - Tabbed settings page (client component)
- `app/api/org/[...path]/route.ts` - Catch-all proxy for `/org/*` endpoints

### API client additions in `lib/api.ts`

New types matching the existing Go domain types:

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
  has_client_secret?: boolean
  has_certificate?: boolean
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

New `api.org` namespace using `orgRequest` (same proxy pattern as `platformRequest`):

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
      orgRequest<OrgMember>('/org/members', { method: 'POST', body: JSON.stringify(data) }),
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
    create: (data: Partial<SSOConnection>) =>
      orgRequest<SSOConnection>('/org/sso', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<SSOConnection>) =>
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
    create: (data: { type: string; display_name: string; base_url: string; api_key?: string; api_secret?: string }) =>
      orgRequest<Integration>('/org/integrations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Integration & { api_key?: string; api_secret?: string }>) =>
      orgRequest<Integration>(`/org/integrations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      orgRequest<void>(`/org/integrations/${id}`, { method: 'DELETE' }),
  },
}
```

### Settings page tab layout

Single page with five tabs using shadcn `Tabs`:

1. **General** - Inline-editable org name, read-only slug and created date
2. **Members** - Table with name, email, roles, remove action. "Add Member" inline section with user search + create new user. Role assignment dropdown per member.
3. **SSO** - Card list of connections with type badge (SAML/OIDC), display name, enabled toggle. "Add Connection" form with type selector, conditional fields (OIDC: issuer URL, client ID, client secret, scopes; SAML: entity ID, SSO URL, certificate, metadata URL). Edit/delete per card. Shows "Secret configured" indicator without exposing values.
4. **Billing** - Read-only status badge, pilot end date, contract notes. Editable billing contact email with save.
5. **Integrations** - Card list with type badge (PowerSchool), display name, base URL, enabled toggle. "Add Integration" form with type selector, connection fields. Edit/delete per card. Shows "Credentials configured" indicator. Shows last synced timestamp when available.

## Security

- All `/org/*` handlers use session-based org resolution (`session.OrgID`)
- Write endpoints gated by `RequirePermission` middleware with appropriate permission strings
- SSO client secrets and integration API keys/secrets never returned in API responses - boolean indicators (`has_client_secret`, `has_api_key`, etc.) shown instead
- `PUT`/`DELETE` on SSO and integrations verify `resource.OrgID == session.OrgID` before acting
- `DELETE /org/members/{userId}` blocks removal of the last `org:manage` member to prevent orphaned orgs
- `PUT /org/settings` does not accept slug changes
- Credentials encrypted at rest with AES-256-GCM
