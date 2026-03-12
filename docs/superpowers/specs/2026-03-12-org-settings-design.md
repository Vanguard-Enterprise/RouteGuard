# Org Settings Page Design

## Goal

Build a tabbed settings page at `/dashboard/settings` where org admins can manage their organization's profile, members, SSO connections, billing info, and third-party integrations.

## Architecture

Tabbed settings page using shadcn Tabs. New org-scoped API route group at `/org/*` gated by `Authenticate` middleware. The active org comes from the user's session - no org ID in URLs. Frontend proxies client-side requests through a Next.js catch-all route at `/api/org/[...path]` to forward the `rg_session` cookie (same pattern as `/api/platform/[...path]`).

## Database

### New table: `sso_connections`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `org_id` | UUID FK -> organizations | |
| `type` | text | "saml" or "oidc" |
| `display_name` | text | |
| `metadata_url` | text | SAML metadata URL or OIDC discovery URL |
| `client_id_enc` | text | Encrypted (OIDC) |
| `client_secret_enc` | text | Encrypted (OIDC) |
| `entity_id` | text | SAML entity ID |
| `enabled` | boolean | default true |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### New table: `integrations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `org_id` | UUID FK -> organizations | |
| `type` | text | "powerschool" initially, extensible |
| `display_name` | text | |
| `base_url` | text | |
| `api_key_enc` | text | Encrypted |
| `api_secret_enc` | text | Encrypted |
| `enabled` | boolean | default true |
| `sync_schedule` | text | Cron expression, nullable (future use) |
| `last_synced_at` | timestamp | nullable (future use) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

Sensitive fields encrypted with AES-256-GCM using the existing `crypto.Encrypt`/`crypto.Decrypt` pattern and `DataEncryptionKey`.

### Existing tables used

- `organizations` - for General tab (name, slug)
- `org_memberships`, `org_roles`, `org_member_roles` - for Members tab
- `org_billing` - for Billing tab
- `users` - for member lookup/creation

## API Endpoints

All under `/org/*`, requiring authenticated session. Active org resolved from session.

### General

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/org/settings` | Returns org name, slug, created_at |
| `PUT` | `/org/settings` | Update org name |

### Members

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/org/members` | List members with decrypted name/email and roles |
| `POST` | `/org/members` | Create user and add to org |
| `POST` | `/org/members/invite` | Invite user by email (creates with no password) |
| `DELETE` | `/org/members/{userId}` | Remove member from org |
| `PUT` | `/org/members/{userId}/roles` | Assign roles to member |
| `GET` | `/org/roles` | List available roles for the org |

### SSO

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/org/sso` | List SSO connections for this org |
| `POST` | `/org/sso` | Create SSO connection |
| `PUT` | `/org/sso/{id}` | Update SSO connection |
| `DELETE` | `/org/sso/{id}` | Delete SSO connection |

SSO connection create/update body:
```json
{
  "type": "saml" | "oidc",
  "display_name": "string",
  "metadata_url": "string",
  "client_id": "string (OIDC only)",
  "client_secret": "string (OIDC only)",
  "entity_id": "string (SAML only)",
  "enabled": true
}
```

### Billing

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/org/billing` | Returns billing status, pilot end date, contact, notes |
| `PUT` | `/org/billing/contact` | Update billing contact email only |

### Integrations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/org/integrations` | List configured integrations |
| `POST` | `/org/integrations` | Add integration config |
| `PUT` | `/org/integrations/{id}` | Update integration config |
| `DELETE` | `/org/integrations/{id}` | Remove integration |

Integration create/update body:
```json
{
  "type": "powerschool",
  "display_name": "string",
  "base_url": "string",
  "api_key": "string",
  "api_secret": "string",
  "enabled": true
}
```

## Go Backend Structure

### New files

- `internal/repository/sso_repo.go` - CRUD for `sso_connections`
- `internal/repository/integration_repo.go` - CRUD for `integrations`
- `internal/api/org_settings_handler.go` - General settings handlers
- `internal/api/org_member_handler.go` - Org-level member handlers
- `internal/api/org_sso_handler.go` - SSO connection handlers
- `internal/api/org_billing_handler.go` - Org billing handlers
- `internal/api/org_integration_handler.go` - Integration handlers

### New domain types in `internal/domain/types.go`

```go
type SSOConnection struct {
    ID              string     `json:"id"`
    OrgID           string     `json:"org_id"`
    Type            string     `json:"type"`
    DisplayName     string     `json:"display_name"`
    MetadataURL     string     `json:"metadata_url"`
    ClientID        string     `json:"client_id,omitempty"`
    ClientIDEnc     string     `json:"-"`
    ClientSecret    string     `json:"-"`
    ClientSecretEnc string     `json:"-"`
    EntityID        string     `json:"entity_id,omitempty"`
    Enabled         bool       `json:"enabled"`
    CreatedAt       time.Time  `json:"created_at"`
    UpdatedAt       time.Time  `json:"updated_at"`
}

type Integration struct {
    ID           string     `json:"id"`
    OrgID        string     `json:"org_id"`
    Type         string     `json:"type"`
    DisplayName  string     `json:"display_name"`
    BaseURL      string     `json:"base_url"`
    APIKey       string     `json:"-"`
    APIKeyEnc    string     `json:"-"`
    APISecret    string     `json:"-"`
    APISecretEnc string     `json:"-"`
    Enabled      bool       `json:"enabled"`
    SyncSchedule *string    `json:"sync_schedule"`
    LastSyncedAt *time.Time `json:"last_synced_at"`
    CreatedAt    time.Time  `json:"created_at"`
    UpdatedAt    time.Time  `json:"updated_at"`
}
```

### Route wiring in `server.go`

New route group under `/org` with `Authenticate` middleware (no `RequirePlatform`):

```go
r.Route("/org", func(r chi.Router) {
    r.Use(middleware.Authenticate(s.cache, s.pool))

    r.Get("/settings", h.OrgGetSettings)
    r.Put("/settings", h.OrgUpdateSettings)

    r.Get("/members", h.OrgListMembers)
    r.Post("/members", h.OrgCreateMember)
    r.Post("/members/invite", h.OrgInviteMember)
    r.Delete("/members/{userId}", h.OrgRemoveMember)
    r.Put("/members/{userId}/roles", h.OrgUpdateMemberRoles)
    r.Get("/roles", h.OrgListRoles)

    r.Get("/sso", h.OrgListSSO)
    r.Post("/sso", h.OrgCreateSSO)
    r.Put("/sso/{id}", h.OrgUpdateSSO)
    r.Delete("/sso/{id}", h.OrgDeleteSSO)

    r.Get("/billing", h.OrgGetBilling)
    r.Put("/billing/contact", h.OrgUpdateBillingContact)

    r.Get("/integrations", h.OrgListIntegrations)
    r.Post("/integrations", h.OrgCreateIntegration)
    r.Put("/integrations/{id}", h.OrgUpdateIntegration)
    r.Delete("/integrations/{id}", h.OrgDeleteIntegration)
})
```

Handlers extract the active org ID from `middleware.SessionFromContext(ctx).ActiveOrgID`.

### Handler and repo additions to Handler struct

Add `sso *repository.SSORepo` and `integrations *repository.IntegrationRepo` fields to `Handler` struct and `NewHandler` constructor.

## Frontend Structure

### New files

- `app/dashboard/settings/page.tsx` - Tabbed settings page (client component)
- `app/api/org/[...path]/route.ts` - Catch-all proxy for `/org/*` endpoints

### API client additions in `lib/api.ts`

New `api.org` namespace:

```typescript
interface SSOConnection {
  id: string
  org_id: string
  type: "saml" | "oidc"
  display_name: string
  metadata_url: string
  client_id?: string
  entity_id?: string
  enabled: boolean
  created_at: string
  updated_at: string
}

interface Integration {
  id: string
  org_id: string
  type: string
  display_name: string
  base_url: string
  enabled: boolean
  sync_schedule: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

api.org = {
  settings: {
    get: () => orgRequest<Organization>('/org/settings'),
    update: (data) => orgRequest<Organization>('/org/settings', { method: 'PUT', body }),
  },
  members: {
    list: () => orgRequest<OrgMember[]>('/org/members'),
    create: (data) => orgRequest('/org/members', { method: 'POST', body }),
    invite: (email) => orgRequest('/org/members/invite', { method: 'POST', body }),
    remove: (userId) => orgRequest('/org/members/{userId}', { method: 'DELETE' }),
    updateRoles: (userId, roleIds) => orgRequest('/org/members/{userId}/roles', { method: 'PUT', body }),
  },
  roles: {
    list: () => orgRequest<OrgRole[]>('/org/roles'),
  },
  sso: {
    list: () => orgRequest<SSOConnection[]>('/org/sso'),
    create: (data) => orgRequest<SSOConnection>('/org/sso', { method: 'POST', body }),
    update: (id, data) => orgRequest<SSOConnection>('/org/sso/{id}', { method: 'PUT', body }),
    delete: (id) => orgRequest('/org/sso/{id}', { method: 'DELETE' }),
  },
  billing: {
    get: () => orgRequest<OrgBilling>('/org/billing'),
    updateContact: (email) => orgRequest('/org/billing/contact', { method: 'PUT', body }),
  },
  integrations: {
    list: () => orgRequest<Integration[]>('/org/integrations'),
    create: (data) => orgRequest<Integration>('/org/integrations', { method: 'POST', body }),
    update: (id, data) => orgRequest<Integration>('/org/integrations/{id}', { method: 'PUT', body }),
    delete: (id) => orgRequest('/org/integrations/{id}', { method: 'DELETE' }),
  },
}
```

`orgRequest` follows the same proxy pattern as `platformRequest` - client-side goes through `/api/org/...`, server-side goes direct.

### Settings page tab layout

Single page with five tabs using shadcn `Tabs`:

1. **General** - Inline-editable org name, read-only slug and created date
2. **Members** - Table with name, email, roles, remove action. "Add Member" inline section with user search + create new user. Role assignment dropdown per member.
3. **SSO** - Card list of connections with type badge, display name, enabled toggle. "Add Connection" form with type selector (SAML/OIDC), conditional fields. Edit/delete per card.
4. **Billing** - Read-only status badge, pilot end date, contract notes. Editable billing contact email with save.
5. **Integrations** - Card list with type badge, display name, base URL, enabled toggle. "Add Integration" form with type selector, connection fields. Edit/delete per card. Shows last synced timestamp when available.

## Security

- All `/org/*` handlers verify the user is a member of the active org (session-based)
- SSO client secrets and integration API keys/secrets never returned in API responses - only a masked indicator (e.g., "configured" vs "not set")
- Org admins need appropriate role/permission to access settings (existing RBAC middleware can be extended)
- Credentials encrypted at rest with AES-256-GCM

## Migrations

Two new migration files:
- `NNNN_create_sso_connections.up.sql` / `down.sql`
- `NNNN_create_integrations.up.sql` / `down.sql`
