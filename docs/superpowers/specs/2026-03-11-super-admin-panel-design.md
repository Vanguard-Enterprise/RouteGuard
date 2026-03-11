# Super Admin Panel Design

## Overview

The super admin panel gives RouteGuard platform staff full cross-org visibility and management capabilities. Platform users (members of the platform org) get an extended dashboard with admin sub-routes at `/dashboard/admin/*`, while retaining the ability to "enter" any customer org via the org switcher for deeper operational work.

## Approach

Hybrid routing under `/dashboard`:
- Platform-only pages live at `/dashboard/admin/*`
- Org-level pages stay at `/dashboard/routes`, `/dashboard/students`, etc.
- Sidebar switches between platform nav and district nav based on `is_platform` on the active org
- Layout-level auth gates `/dashboard/admin/*` routes to platform org members only

**Note:** This supersedes the previously documented `app/admin/` route section in CLAUDE.md. The `app/admin/` path is no longer used - all admin functionality lives under `/dashboard/admin/*`. CLAUDE.md must be updated during implementation.

---

## 1. Routing & Navigation

### Platform org sidebar nav

| Label | Path | Description |
|-------|------|-------------|
| Dashboard | `/dashboard` | Platform home - stats + activity feed |
| Organizations | `/dashboard/admin/orgs` | List, create, manage all orgs |
| Users | `/dashboard/admin/users` | Cross-org user lookup and management |
| Audit Log | `/dashboard/admin/audit` | Security events |
| Billing | `/dashboard/admin/billing` | Contract/subscription tracking per org |
| Updates | `/dashboard/admin/updates` | Device software rollout status |
| Settings | `/dashboard/settings` | Platform settings |

### District org sidebar nav (unchanged)

Dashboard, Routes, Students + Settings/Help/Search

### Auth gating

The dashboard layout server component (`app/dashboard/layout.tsx`) already calls `getServerUser()`. For `/dashboard/admin/*` routes, a nested layout at `app/dashboard/admin/layout.tsx` checks `me.active_org.is_platform` and redirects to `/forbidden` if false. This is consistent with the existing pattern and avoids adding API calls to Next.js middleware.

---

## 2. Platform Dashboard Home (`/dashboard`)

When the active org is the platform org, the dashboard page renders a platform-specific view.

### Top row - Key stat cards
- Total organizations (active / suspended)
- Total users across all orgs
- Active sessions right now
- Active trips in progress

### Bottom section - Recent security activity feed
- Last ~20 security events (logins, org changes, permission changes, etc.)
- Each entry shows: timestamp, actor, action, target
- Link to full audit log

Implementation: the page component checks `is_platform` on the active org and conditionally renders the platform view vs the district dashboard view.

---

## 3. Organizations Management (`/dashboard/admin/orgs`)

### List view
- Searchable, sortable table of all orgs
- Columns: Name, Slug, Status (active/suspended), Billing Status, Members count, Created date
- Row actions: Edit, Suspend/Reactivate, Enter org (impersonate), Delete
- **Search strategy:** Org names are encrypted at rest. Search is by slug (plaintext, indexed). The API decrypts names for display after filtering. For the expected org count (tens to low hundreds), this is efficient.

### Create org flow
- Name, slug (auto-generated from name, editable)
- Seeds default system roles (Owner, Member) automatically via existing `SeedSystemRoles`

### Org detail page (`/dashboard/admin/orgs/[id]`)
- **Overview tab:** org info, SSO connections, billing status, created/updated dates
- **Members tab:** list members, add/remove users, assign roles within that org
- **Roles tab:** view/manage custom roles for that org
- **SSO tab:** configure OIDC/SAML connections
- **Danger zone:** suspend/reactivate, delete org (with confirmation)

### Suspend behavior
- Suspended orgs' members can't log in or switch to that org
- Org data is preserved, just inaccessible
- Tracked via `suspended_at` timestamp column on the organizations table
- **Session invalidation:** The `Authenticate` middleware checks `suspended_at` on the active org on every request (cached in Redis with short TTL). If the org is suspended, the request is rejected with 403 and the session is cleared. This avoids needing a bulk session purge mechanism.

### Delete behavior
- Soft delete only - sets `deleted_at` timestamp, does not remove data
- Cascading effects: all memberships, roles, SSO connections become inaccessible (filtered by `deleted_at IS NULL` in queries)
- Active sessions in the org are invalidated via the same check-on-access pattern as suspension
- Platform org cannot be deleted (enforced in API handler)

---

## 4. Users Management (`/dashboard/admin/users`)

### List view
- Searchable table of all users across all orgs
- Columns: Name, Email, Orgs (list of org names), Last login, Created date
- Row actions: View details, Reset password, Disable account
- **Search strategy:** User names and emails are encrypted at rest. Search is by email hash (exact match via HMAC, already indexed). The API decrypts names/emails for display after filtering. Partial email search is not supported - use exact email lookup.

### User detail page (`/dashboard/admin/users/[id]`)
- Profile info (name, email, auth providers)
- Org memberships: which orgs they're in, what roles they have in each
- Active sessions: list with ability to revoke individual or all sessions
- Security: force password reset, disable/enable account

### Disable behavior
- Adds a `disabled_at` timestamp to the users table
- Disabled users can't log in
- Blocks the user everywhere, not just one org (different from org suspension)
- **Session invalidation:** Same check-on-access pattern as org suspension. The `Authenticate` middleware checks `disabled_at` on the user (cached in Redis with short TTL). If disabled, request is rejected with 403 and session is cleared.

---

## 5. Audit Log (`/dashboard/admin/audit`)

### Events captured
- **Authentication:** login success, login failure, logout, session revoked
- **Org lifecycle:** org created, suspended, reactivated, deleted
- **Membership:** user added to org, removed from org
- **Permissions:** role created/updated/deleted, role assigned/unassigned
- **SSO:** connection created/updated/deleted
- **Platform actions:** impersonation start/end, user disabled/enabled, password reset triggered
- **Billing:** billing status changed, contract notes updated

### Storage
- New `audit_events` table (append-only, no updates or deletes)
- Schema: id, actor_id (NOT NULL), actor_email (NOT NULL, denormalized), org_id (nullable, for org-scoped events), event_type, target_type, target_id, metadata (JSONB), ip_address, created_at
- Indexed on: event_type, actor_id, org_id, target_id, created_at
- All audit events have an actor (system events use a well-known system user ID)

### UI
- Filterable table: by event type, actor, date range
- Each row: timestamp, actor name, event description, target
- Expandable row for full metadata/details
- Cursor-based pagination: loads most recent, "load more" for older events

---

## 6. Billing (`/dashboard/admin/billing`)

RouteGuard is B2B enterprise only. No tiered pricing plans - every org has a unique contract.

### Per-org contract tracking (separate `org_billing` table)
- `org_id`: references organizations, unique (one billing record per org)
- `billing_status`: `pilot` | `active` | `cancelled`
- `pilot_ends_at`: nullable date for pilot expiration
- `contract_notes`: free text for deal specifics (fleet size, pricing, terms)
- `billing_contact_email`: who to reach out to about the contract

Stored in a separate table to keep billing concerns decoupled from the identity/auth layer. This also makes it easier to extend with Stripe integration later.

### UI
- Table of all orgs with billing status, pilot end date (visual indicator if expiring soon)
- Org detail shows contract notes and billing contact
- Status changes logged to audit log

---

## 7. Updates Rollout (`/dashboard/admin/updates`)

Read-only visibility into device software versions across orgs. Devices self-report their version when they check in - no remote push mechanism.

**Note:** This section is deferred until the device table and device check-in API exist. The `software_releases` table and release management API can be built now; the rollout dashboard UI is blocked on device infrastructure.

### Data model
- Devices track `software_version` and `last_seen_at`
- `software_releases` table: id, version, release_date, release_notes, created_at

### UI
- Current latest version displayed at top
- Per-org breakdown table: Org name, Total devices, Devices on latest, Devices on older versions, percentage up-to-date
- Expandable row for individual device versions within an org
- Overall rollout progress bar across all orgs

---

## 8. Impersonation Banner

When a platform user switches into a customer org via the org switcher.

### Banner component
- Fixed bar at top of the page, above the sidebar header
- Amber/warning color (uses `brand-amber`)
- Text: "Viewing as [Org Name]" with "Return to platform" button
- "Return to platform" calls `/auth/switch-org` back to platform org, redirects to `/dashboard`

### Detection logic
- Add `home_org_id` to `SessionPayload` in Redis. Set at login time to the user's initial active org ID. Unchanged by `SwitchOrg`.
- Add `home_org_id` to `MeResponse` so the frontend can read it.
- Banner renders in dashboard layout when `active_org.id !== home_org_id` and user is a platform org member.

### Platform API access during impersonation
When a platform user switches into a customer org, their `session.OrgID` changes and `RequirePlatform` middleware blocks `/platform/*` endpoints. This is intentional - platform admin actions require switching back to the platform org first. The "Return to platform" button calls `/auth/switch-org` (which is not behind `RequirePlatform`) to switch back. The frontend hides the admin sidebar nav while impersonating.

### Audit trail
- "Impersonation start" event logged when a platform user switches into a customer org
- "Impersonation end" event logged when they switch back

---

## 9. API Endpoints

All platform admin routes gated by `RequirePlatform` middleware.

### Pagination strategy
- **Orgs and Users lists:** Offset-based pagination (`?page=1&per_page=25`) - supports sorting by different columns.
- **Audit events:** Cursor-based pagination (`?cursor=<created_at>&limit=50`) - append-only data, always sorted by newest first.

### Organizations (`/platform/orgs`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/platform/orgs` | List all orgs (search, pagination) |
| POST | `/platform/orgs` | Create org |
| GET | `/platform/orgs/:id` | Org detail |
| PUT | `/platform/orgs/:id` | Update org |
| DELETE | `/platform/orgs/:id` | Delete org (not platform org) |
| POST | `/platform/orgs/:id/suspend` | Suspend org |
| POST | `/platform/orgs/:id/reactivate` | Reactivate org |
| GET | `/platform/orgs/:id/members` | List org members |
| POST | `/platform/orgs/:id/members` | Add member to org |
| DELETE | `/platform/orgs/:id/members/:userId` | Remove member |
| PUT | `/platform/orgs/:id/members/:userId/roles` | Replace all roles for member (body: `{ role_ids: [] }`) |
| GET | `/platform/orgs/:id/billing` | Get billing info |
| PUT | `/platform/orgs/:id/billing` | Update billing status/notes |

### Users (`/platform/users`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/platform/users` | List all users (search, pagination) |
| GET | `/platform/users/:id` | User detail with all memberships |
| POST | `/platform/users/:id/disable` | Disable user |
| POST | `/platform/users/:id/enable` | Enable user |
| POST | `/platform/users/:id/reset-password` | Force password reset |
| DELETE | `/platform/users/:id/sessions` | Revoke all sessions |

### Audit (`/platform/audit`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/platform/audit` | Query audit events (filterable) |

### Updates (`/platform/updates`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/platform/updates/releases` | List software releases |
| POST | `/platform/updates/releases` | Create a release record |
| GET | `/platform/updates/rollout` | Rollout status across orgs |

### Stats (`/platform/stats`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/platform/stats` | Dashboard stats (org count, user count, active sessions, active trips) |

---

## 10. Database Changes

### New tables

#### `audit_events`
```sql
CREATE TABLE audit_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL REFERENCES users(id),
    actor_email TEXT NOT NULL,
    org_id      UUID REFERENCES organizations(id),
    event_type  TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   UUID,
    metadata    JSONB DEFAULT '{}',
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX idx_audit_events_target_id ON audit_events(target_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);
```

#### `software_releases`
```sql
CREATE TABLE software_releases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version       TEXT NOT NULL UNIQUE,
    release_date  DATE NOT NULL,
    release_notes TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `org_billing`
```sql
CREATE TABLE org_billing (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID NOT NULL UNIQUE REFERENCES organizations(id),
    billing_status        TEXT NOT NULL DEFAULT 'pilot',
    pilot_ends_at         TIMESTAMPTZ,
    contract_notes        TEXT,
    billing_contact_email TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Column additions

#### `organizations`
```sql
ALTER TABLE organizations ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN deleted_at TIMESTAMPTZ;
```

#### `users`
```sql
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
```

### Device tracking (when device table exists)
```sql
-- Applied to existing or future devices table
ALTER TABLE devices ADD COLUMN software_version TEXT;
ALTER TABLE devices ADD COLUMN last_seen_at TIMESTAMPTZ;
```

No changes to existing auth tables (org_memberships, org_roles, org_member_roles, sso_connections).
