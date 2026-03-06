# Multi-Tenant Auth System Design

Date: 2026-03-06

## Goal

Build a multi-tenant auth system from scratch with global users, multi-org membership, full RBAC, SSO (OIDC/SAML) with JIT provisioning, and PII encryption at rest. Staff are users in a special platform org.

## Data Model

### users

Global accounts, not tied to any org.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| email_enc | text | AES-256-GCM encrypted |
| email_hash | text | HMAC-SHA256 for lookup, unique |
| name_enc | text | AES-256-GCM encrypted |
| password_hash | text | Nullable - SSO-only users won't have one |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### organizations

Tenants.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name_enc | text | AES-256-GCM encrypted |
| slug | text | Unique, URL-safe |
| is_platform | boolean | True only for built-in RouteGuard org |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### org_memberships

Links users to orgs (many-to-many).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK -> users |
| org_id | uuid | FK -> organizations |
| created_at | timestamptz | |

Unique constraint on `(user_id, org_id)`.

### org_roles

Custom roles per org.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | uuid | FK -> organizations |
| name | text | |
| permissions | text[] | e.g. {"members:read", "members:write"} |
| is_system | boolean | Built-in roles like Owner |
| created_at | timestamptz | |

### org_member_roles

Assigns roles to members.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| membership_id | uuid | FK -> org_memberships |
| role_id | uuid | FK -> org_roles |
| created_at | timestamptz | |

Unique constraint on `(membership_id, role_id)`.

### sso_connections

OIDC/SAML config per org.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | uuid | FK -> organizations |
| type | text | "oidc" or "saml" |
| display_name | text | |
| enabled | boolean | |
| oidc_issuer_url | text | Nullable |
| oidc_client_id | text | Nullable |
| oidc_client_secret_enc | text | AES-256-GCM encrypted, nullable |
| oidc_scopes | text | Space-separated, nullable |
| saml_entity_id | text | Nullable |
| saml_sso_url | text | Nullable |
| saml_certificate_enc | text | AES-256-GCM encrypted, nullable |
| saml_metadata_url | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### user_identities

Tracks auth providers per user.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK -> users |
| provider | text | "password", "oidc", "saml" |
| provider_user_id | text | e.g. OIDC sub claim, nullable |
| metadata | jsonb | OIDC/SAML claims, nullable |
| created_at | timestamptz | |

## Auth Flows

### Password Login

1. User enters email on `/login`
2. `POST /auth/lookup` - API looks up user by `email_hash`, checks org memberships and SSO configs
3. Returns available auth methods (password and/or SSO buttons with org slugs)
4. User submits password via `POST /auth/login`
5. Verify bcrypt hash, create session in Redis
6. If user has multiple orgs, return org list for selection. If one org, auto-select.
7. Session payload: `{user_id, org_id, permissions[]}`

### SSO Login (OIDC/SAML)

1. User enters email, sees SSO button(s) for their org(s)
2. Click redirects to IdP via `GET /auth/sso/{slug}/oidc/init` or `GET /auth/sso/{slug}/saml/init`
3. IdP authenticates, redirects back with token/assertion
4. API validates token/assertion
5. Look up user by `provider_user_id` in `user_identities`
6. **JIT provisioning:** if no user exists, create user + org membership + identity record
7. If user exists but isn't a member of this org, add membership automatically (IdP is trusted)
8. Create session, same as password flow

### Org Switching

1. User calls `POST /auth/switch-org` with target org_id
2. API validates user has membership in target org
3. Loads user's permissions for that org (from org_member_roles)
4. Overwrites session payload in Redis with new org_id + permissions[]
5. Returns updated session - no re-auth, instant switch

## Sessions & Security

- **Session storage:** Redis key `session:{token}`, TTL 7 days
- **Session token:** Cryptographically random, stored as `rg_session` httpOnly secure cookie (domain `.route-guard.com`)
- **Session payload:** `{user_id, org_id, permissions[], created_at}`
- **PII encryption:** AES-256-GCM at the application level via `DATA_ENCRYPTION_KEY` env var (32-byte hex)
- **Email lookup:** HMAC-SHA256 via separate `HMAC_KEY` env var for deterministic hashing
- **Password hashing:** bcrypt
- **OIDC:** PKCE flow with state token in Redis (10min TTL)
- **SAML:** SP-initiated, ephemeral RSA key pair for signing
- **Rate limiting:** On login, lookup, and SSO init endpoints
- **Minimal data exposure:** API responses only return what the caller's permissions allow

## API Endpoints

### Public (rate-limited)

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/lookup | Email lookup, returns available auth methods |
| POST | /auth/login | Email + password login |
| GET | /auth/sso/{slug}/oidc/init | Start OIDC flow |
| GET | /auth/sso/oidc/callback | OIDC callback |
| GET | /auth/sso/{slug}/saml/init | Start SAML flow |
| POST | /auth/sso/saml/acs | SAML assertion consumer |
| GET | /auth/sso/saml/metadata | SP metadata |

### Authenticated

| Method | Path | Description |
|--------|------|-------------|
| GET | /auth/me | Current user + active org + permissions |
| POST | /auth/logout | Destroy session |
| POST | /auth/switch-org | Switch active org |
| GET | /auth/orgs | List user's org memberships |

### Org-scoped (authenticated + org selected)

| Method | Path | Description |
|--------|------|-------------|
| GET | /org/members | List org members |
| POST | /org/members | Invite/add member |
| DELETE | /org/members/{id} | Remove member |
| GET | /org/roles | List org roles |
| POST | /org/roles | Create role |
| PATCH | /org/roles/{id} | Update role |
| DELETE | /org/roles/{id} | Delete role |
| POST | /org/members/{id}/roles | Assign role |
| DELETE | /org/members/{id}/roles/{roleId} | Unassign role |
| GET | /org/sso | List SSO connections |
| POST | /org/sso | Create SSO connection |
| PATCH | /org/sso/{id} | Update SSO connection |
| DELETE | /org/sso/{id} | Delete SSO connection |

### Platform org only (authenticated + is_platform)

| Method | Path | Description |
|--------|------|-------------|
| GET | /platform/orgs | List all organizations |
| POST | /platform/orgs | Create organization |
| PATCH | /platform/orgs/{id} | Update organization |
| DELETE | /platform/orgs/{id} | Delete organization |

System roles are auto-seeded on org creation.

## Dashboard Pages

- `/login` - single page: email input -> auth method detection -> password form or SSO redirect -> org selector if multi-org
- `/dashboard` - org-scoped app shell (empty for now, auth-gated)
- Org switcher component in navigation
