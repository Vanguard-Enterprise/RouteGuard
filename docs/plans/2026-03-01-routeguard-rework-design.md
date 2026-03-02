# RouteGuard — Full Rework Design

**Date:** 2026-03-01
**Status:** Approved

---

## Overview

RouteGuard is an enterprise school bus fleet management platform. This document covers the full ground-up redesign: new architecture, infrastructure, auth system, data model, real-time pipeline, driver PWA, and device provisioning.

The product serves three audiences:
- **Super admins** (RouteGuard staff) — manage orgs, devices, platform settings
- **Org users** (district/company admins, school admins) — manage routes, students, drivers, vehicles, trips, reports
- **Drivers** — operate pre-provisioned SBC tablets mounted in buses during runs

---

## 1. Infrastructure & Deployment

### Hosting

Self-hosted on a dedicated LXC container on a Proxmox node. The LXC runs:

| Container | Purpose |
|-----------|---------|
| Traefik | Reverse proxy, SSL termination (Let's Encrypt wildcard) |
| `routeguard-dashboard` | Next.js app (port 3000) |
| `routeguard-api` | Go service (port 8080) |
| PostgreSQL 16 | Primary database |
| Redis 7 | Sessions, pub/sub, cache, rate limiting |
| GitHub Actions self-hosted runner | CI/CD |

### Domain Routing

| Domain | Target |
|--------|--------|
| `route-guard.com` | Next.js dashboard |
| `www.route-guard.com` | Next.js dashboard |
| `api.route-guard.com` | Go API service |

Traefik handles TLS termination and routing based on hostname. All traffic is HTTPS.

### Monorepo Structure

```
RouteGuard/
├── dashboard/                    # Next.js app
│   ├── public/
│   │   └── assets/              # Logo, icons from brand assets
│   ├── src/
│   │   ├── app/
│   │   │   ├── (marketing)/     # Public pages: landing, pricing, contact, terms, privacy
│   │   │   ├── login/
│   │   │   │   └── [slug]/      # Org login page
│   │   │   ├── staff/
│   │   │   │   └── login/       # Staff-only portal
│   │   │   ├── auth/            # SSO callbacks (proxied to Go API)
│   │   │   ├── dashboard/       # Org admin + school admin
│   │   │   ├── admin/           # Super admin panel
│   │   │   ├── driver/          # Driver PWA
│   │   │   └── api/
│   │   │       └── stream/      # SSE proxy from Go → browser
│   │   ├── components/
│   │   │   ├── ui/              # shadcn base components
│   │   │   ├── dashboard/
│   │   │   ├── admin/
│   │   │   ├── driver/
│   │   │   ├── map/
│   │   │   └── marketing/
│   │   └── lib/
│   │       ├── api.ts           # Typed Go API client
│   │       └── utils.ts
│   ├── next.config.ts
│   ├── Dockerfile
│   └── package.json
│
├── routeguard-api/               # Go service
│   ├── cmd/
│   │   └── api/
│   │       └── main.go
│   ├── internal/
│   │   ├── auth/                # Session, password, OIDC, SAML, device auth
│   │   ├── api/                 # HTTP handlers
│   │   ├── domain/              # Business logic + types
│   │   ├── repository/          # Postgres queries
│   │   ├── cache/               # Redis operations
│   │   ├── stream/              # SSE + Redis pub/sub
│   │   ├── notifications/       # Twilio SMS
│   │   └── middleware/          # Auth, RBAC, rate limiting, audit logging
│   ├── migrations/              # SQL migration files
│   ├── Dockerfile
│   └── go.mod
│
├── deploy/
│   ├── docker-compose.yml       # Full stack: dashboard, api, postgres, redis, traefik
│   ├── traefik/
│   │   └── traefik.yml
│   └── scripts/
│       └── provision-db.sh
│
├── device/
│   └── pi-gen/                  # RPi OS image build config
│
└── .github/
    └── workflows/
        ├── dashboard.yml        # Build + deploy Next.js on push to main
        ├── api.yml              # Build + deploy Go API on push to main
        └── device-image.yml     # Build RPi .img.gz on release tag
```

### CI/CD

- **Repo host:** GitHub
- **CI:** GitHub Actions with a self-hosted runner on the LXC
- On push to `main`: build Docker image(s) for changed services, push to local Docker registry on LXC, rolling restart of affected containers
- On release tag: build RPi OS image via `pi-gen` in Docker, attach `.img.gz` to GitHub release

---

## 2. Tech Stack

### Dashboard (`/dashboard` — Next.js)

| Concern | Choice |
|---------|--------|
| Framework | Next.js 16, App Router, React 19, TypeScript |
| Styling | Tailwind v4 + shadcn/ui |
| Maps | Mapbox GL JS |
| Forms | React Hook Form + Zod |
| Toasts | Sonner |
| Real-time | SSE (proxied from Go API via `/api/stream/`) |
| API client | Typed fetch wrapper (`src/lib/api.ts`) |

Next.js has **no direct database access**. All data flows through the Go API. Next.js is purely the UI layer — server components fetch from the Go API, forwarding the session cookie.

### Go API (`/routeguard-api`)

| Concern | Choice |
|---------|--------|
| Language | Go |
| Router | `chi` |
| Database | `pgx/v5` → PostgreSQL 16 |
| Cache / Pub-sub | `go-redis/v9` → Redis 7 |
| Migrations | `golang-migrate` |
| SMS | Twilio REST API |
| OIDC | `coreos/go-oidc` + `golang.org/x/oauth2` |
| SAML | `crewjam/saml` |

### Infrastructure Services

| Service | Purpose |
|---------|---------|
| PostgreSQL 16 | All persistent data — Go owns it exclusively |
| Redis 7 | Sessions, device token cache, GPS pub/sub channels, rate limiting |
| Twilio | Guardian SMS notifications |
| Mapbox | Geocoding + map tiles (called from browser) |

---

## 3. Authentication & Security

### Staff Login

- URL: `route-guard.com/staff/login` — not linked from public pages
- Method: email + bcrypt (cost 12) password only
- Only `super_admin` role users land here
- No self-registration — accounts provisioned by existing super admins

### Org User Login

- URL: `route-guard.com/login/[org-slug]` — org-branded login page
- Supported methods (org configures which are enabled):
  - Email + bcrypt password
  - OIDC — any provider: Google Workspace, Microsoft Entra ID, Okta, OneLogin, PingFederate, ADFS, Shibboleth, ClassLink, Clever, or any generic OIDC provider
  - SAML 2.0 — any IdP
- Go implements full OIDC (PKCE) and SAML SP flows in-house — no third-party auth service
- On SSO login, Go extracts groups/claims, runs them through `sso_role_mappings`, and assigns org roles automatically. Roles re-sync on every login.

### Driver Device Auth

- Device is org-bound from Phase 1 provisioning (see Section 6)
- Driver authenticates on the device by entering a PIN or tapping their RFID badge
- Go validates PIN (Argon2id) or RFID badge ID against the `drivers` table **scoped to `WHERE org_id = device.org_id`** — cross-org validation is impossible
- Successful auth creates a short-lived trip session tied to that device

### Session Management

- All sessions stored in Redis with full user/device payload — no Postgres hit on every request
- Cookie: `rg_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=.route-guard.com`
- Session TTL: 7 days for org/staff users, duration of run for device trip sessions
- `oauth_states` stored in Redis with short TTL — no database table

### Encryption at Rest

**Application-level (AES-256-GCM, Go encrypts before Postgres):**
- `guardians.phone`, `guardians.alt_phone`
- `students.medical_notes`, `students.rfid_tag_id`
- `drivers.rfid_badge_id`, `drivers.license_number`
- `sso_connections.oidc_client_secret`, `sso_connections.saml_certificate`

**Hashed (SHA-256 — hash sufficient, raw value shown once):**
- `devices.device_token_hash`
- `api_keys.key_hash`
- `drivers.pin_hash` — Argon2id

**OS-level:** LXC disk encrypted with LUKS. Redis not exposed outside the LXC internal network.

### Additional Security Practices

- TLS everywhere via Traefik + Let's Encrypt
- HSTS, strict CSP, X-Frame-Options, X-Content-Type-Options on all responses
- Rate limiting on all auth + provisioning endpoints via Redis sliding window
- CSRF protection on all state-mutating dashboard routes
- Parameterized queries via `pgx` throughout — no SQL injection surface
- Audit log table: every sensitive operation logged with actor, action, target, IP, timestamp
- Secrets via environment variables only — never committed

---

## 4. Database Schema

**Database:** PostgreSQL 16. All access through the Go API — Next.js has no DB connection.

### Tenant & Auth

```sql
organizations        -- id, name, slug, type (district|company), logo_url, timezone, settings, created_at, updated_at
users                -- id, org_id, email, name, avatar_url, last_login_at, created_at
user_identities      -- id, user_id, provider (oidc|saml|password), provider_user_id, metadata
sessions             -- REMOVED — lives in Redis only
api_keys             -- id, org_id, name, key_hash, key_prefix, scopes, last_used_at, expires_at, created_at
sso_connections      -- id, org_id, type (oidc|saml), display_name, domain, enabled, [oidc fields], [saml fields — encrypted], created_at, updated_at
```

### RBAC

```sql
org_roles            -- id, org_id, name, permissions (jsonb), is_system (bool), created_at
user_roles           -- id, user_id, role_id  (replaces single role column on users)
sso_role_mappings    -- id, sso_connection_id, claim_key, claim_value, org_role_id
```

**Built-in system roles** (shipped with every org, `is_system = true`, locked permissions):
- `org_admin` — full org management
- `school_admin` — read students/routes, write students
- `driver` — read routes/trips, write trips

Org admins can create additional custom roles with any combination of permissions from the platform permission set.

### Devices

```sql
devices              -- id, org_id, serial, device_token_hash, status (unprovisioned|provisioned|active|revoked), vehicle_id, seat_count, bus_layout (jsonb), provisioned_at, created_at
```

### Core Entities

```sql
schools              -- id, org_id, name, address, city, state, zip, lat, lng, phone, contact_name, contact_email, created_at, updated_at
students             -- id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id (encrypted), address, city, state, zip, lat, lng, status, medical_notes (encrypted), created_at, updated_at
guardians            -- id, org_id, first_name, last_name, phone (encrypted), alt_phone (encrypted), email, sms_opt_in, language, created_at
student_guardians    -- id, student_id, guardian_id, relationship, is_primary
```

### Fleet

```sql
vehicles             -- id, org_id, name, number, capacity, year, make, model, vin, license_plate, status, created_at, updated_at
drivers              -- id, org_id, user_id, first_name, last_name, phone, license_number (encrypted), license_expiry, pin_hash (argon2id), rfid_badge_id (encrypted), rfid_badge_id_hash (sha-256, for fast lookup), status, created_at, updated_at
```

### Routes & Stops

```sql
routes               -- id, org_id, name, type (morning|afternoon|field_trip|activity), status (draft|active|archived), description, estimated_duration_min, created_at, updated_at
stops                -- id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at
student_stops        -- id, student_id, stop_id, route_id, effective_date, end_date
route_assignments    -- id, route_id, vehicle_id, driver_id, effective_date, end_date, days_of_week, created_at
```

### Live Operations

```sql
trips                -- id, route_assignment_id, org_id, date, status (scheduled|in_progress|completed|cancelled), started_at, completed_at, notes, created_at
trip_locations       -- id, trip_id, lat, lng, speed, heading, recorded_at
scan_events          -- id, trip_id, student_id, stop_id, rfid_tag_id, scan_type (board|exit), authorized, recorded_at
sms_messages         -- id, guardian_id, trip_id, student_id, message_type, message_body, twilio_sid, status, sent_at, created_at
```

### Reporting

```sql
daily_summaries      -- id, org_id, route_id, date, total_students, boarded_count, on_time, delay_minutes, notes, created_at
audit_logs           -- id, actor_id, actor_type, action, target_type, target_id, metadata (jsonb), ip_address, created_at
```

---

## 5. Real-time Architecture

### GPS Flow (device → dashboard)

1. Device sends GPS ping to `POST /api/v1/trips/:id/location` every 5 seconds
2. Go writes to `trip_locations` (Postgres) and publishes to Redis channel `trip:location:{trip_id}`
3. Next.js SSE endpoint (`GET /api/stream/trips`) subscribes to relevant Redis channels for the org's active trips
4. Dashboard browser holds one SSE connection — receives location updates, renders on Mapbox map in real-time

### Alerts Flow

Go publishes to `trip:alert:{org_id}` on:
- Unauthorized RFID scan (unknown tag)
- Trip significantly delayed vs scheduled time
- Device heartbeat timeout mid-trip (bus went offline)
- Bus deviation from planned route

SSE delivers alerts to dashboard — toast notification + alert marker on map.

### RFID Scan Flow

1. Device sends `POST /api/v1/trips/:id/scan` with RFID tag ID
2. Go looks up student by `rfid_badge_id_hash` scoped to org, records `scan_event`
3. Triggers Twilio SMS to opted-in guardians (async, non-blocking)
4. Publishes scan event to `trip:scan:{trip_id}` Redis channel → SSE → dashboard updates student boarding list in real-time

### Active Trip Cache

Go caches active trip manifests in Redis (route stops + student list). Avoids Postgres hit on every scan. Cache invalidated when trip ends or route is modified.

---

## 6. Driver PWA

### Overview

- Installed as a PWA on the SBC kiosk browser — fullscreen, no browser chrome, no URL bar
- `start_url: /driver`, `display: standalone`
- Dark-themed UI optimized for in-vehicle viewing — large touch targets (48px+), high contrast, no small text
- Service worker provides offline operation

### Screens

1. **Device lock screen** — always shown when no driver session is active. Org logo, PIN numpad or "Tap badge to begin". No navigation possible from this screen.
2. **Pre-trip** — driver identified, shows assigned route, vehicle info, full stop list, expected student count. "Start Run" CTA.
3. **Active run** — stop-by-stop view: current stop, expected students with board/exit status, RFID scan feedback (green flash = authorized, red = unknown tag), "Next Stop" and "End Run" controls.
4. **Run complete** — summary: total boarded, missed students, run duration. Auto-returns to lock screen.

### Offline Behavior

- Route manifest cached in IndexedDB at run start
- Scan events queued locally if connectivity drops, synced to Go API on reconnect
- GPS pings queued and flushed on reconnect — no location data lost
- App shell cached by service worker (cache-first), API calls network-first with offline fallback queue

---

## 7. Device Provisioning

### Phase 1 — RouteGuard provisions for org (before shipping)

1. Super admin creates a device record in the admin panel → system generates a one-time provisioning token → admin downloads `provision.json`
2. Admin flashes the standard RouteGuard OS image to the SD card using Raspberry Pi Imager
3. Admin copies `provision.json` to the SD card boot partition (FAT32 — writable on any OS)
4. SD card inserted in SBC, device ships to org

### Phase 2 — Org provisions to bus (on org premises)

1. Device boots, provisioning service detects `provision.json` on boot partition
2. Calls `POST /api/v1/devices/provision` with the one-time token
3. Go validates token, creates device record scoped to org, returns long-lived encrypted device credential
4. Provisioning service stores credential encrypted on writable data partition, deletes `provision.json`, switches root filesystem to read-only, reboots into kiosk mode
5. Org admin sees device in dashboard under "Unprovisioned Devices"
6. Org admin assigns device to a vehicle: bus number, seat count, bus layout/seating map, other bus metadata
7. Device status → `active`, ready for driver use

### OS Image

- Built with `pi-gen` in Docker, produced as `.img.gz` attached to GitHub release
- Baked in: read-only root filesystem, Chromium kiosk mode pointed at `route-guard.com/driver`, RouteGuard provisioning systemd service, network firewall (outbound only to `api.route-guard.com:443`)
- No SSH access by default on shipped devices

### Device Security

- Device credential stored encrypted on-disk using a device-derived key (not plaintext)
- mTLS between device and Go API: device presents client certificate alongside device token
- Network firewall: only `api.route-guard.com:443` outbound — no other internet access
- Remote revocation: org admin revokes device from dashboard → Go blacklists token in Redis → device locked out on next request
- Kiosk mode: driver cannot navigate outside the PWA

---

## 8. Go API Route Structure

### Auth (`/auth`)
- `POST /auth/login`
- `POST /auth/logout`
- `GET  /auth/me`
- `GET  /auth/sso/:slug/init`
- `GET  /auth/sso/callback`
- `POST /auth/sso/saml/acs`
- `GET  /auth/sso/saml/metadata`

### Admin (`/admin`) — super_admin only
- `GET  /admin/organizations`
- `POST /admin/organizations`
- `GET  /admin/organizations/:id`
- `PATCH /admin/organizations/:id`
- `DELETE /admin/organizations/:id`
- `GET  /admin/organizations/:id/sso`
- `POST /admin/organizations/:id/sso`
- `PATCH /admin/organizations/:id/sso/:connectionId`
- `DELETE /admin/organizations/:id/sso/:connectionId`
- `GET  /admin/devices`
- `POST /admin/devices`
- `PATCH /admin/devices/:id`
- `DELETE /admin/devices/:id`
- `GET  /admin/audit-logs`

### Dashboard (`/dashboard`) — org-scoped, RBAC enforced

Full CRUD for: schools, students, guardians, drivers, vehicles, routes, stops, route assignments, trips

- `GET  /dashboard/reports/attendance`
- `GET  /dashboard/reports/ridership`
- `GET  /dashboard/reports/performance`
- `GET  /dashboard/reports/export`
- `GET  /dashboard/settings/users`
- `POST /dashboard/settings/users`
- `PATCH /dashboard/settings/users/:id`
- `DELETE /dashboard/settings/users/:id`
- `GET  /dashboard/settings/api-keys`
- `POST /dashboard/settings/api-keys`
- `DELETE /dashboard/settings/api-keys/:id`
- `GET  /dashboard/settings/sso`
- `POST /dashboard/settings/sso`
- `PATCH /dashboard/settings/sso/:id`
- `DELETE /dashboard/settings/sso/:id`
- `GET  /dashboard/settings/roles`
- `POST /dashboard/settings/roles`
- `PATCH /dashboard/settings/roles/:id`
- `DELETE /dashboard/settings/roles/:id`
- `GET  /dashboard/settings/roles/:id/sso-mappings`
- `POST /dashboard/settings/roles/:id/sso-mappings`
- `DELETE /dashboard/settings/roles/:id/sso-mappings/:mappingId`

### Device API v1 (`/api/v1`) — device credential + mTLS
- `POST /api/v1/devices/provision`
- `POST /api/v1/devices/heartbeat`
- `POST /api/v1/auth/pin`
- `POST /api/v1/auth/rfid`
- `GET  /api/v1/routes/:id/manifest`
- `POST /api/v1/trips/start`
- `POST /api/v1/trips/:id/location`
- `POST /api/v1/trips/:id/scan`
- `POST /api/v1/trips/:id/end`

### Streaming (`/stream`)
- `GET /stream/trips` — SSE, org-scoped, streams GPS + scan + alert events

### Webhooks
- `POST /webhooks/twilio/status`

---

## 9. UI / Design System

### Brand Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Navy | `#1B3A5C` | Primary brand, sidebar, navigation, headers |
| Amber | `#F5A825` | CTAs, active states, highlights, accent |
| Forest Green | `#2A7D4F` | Success states, "Route" wordmark |
| Slate | `#F1F4F8` | Page backgrounds |
| White | `#FFFFFF` | Card surfaces |

### Design Direction

Enterprise-first, bold and branded:
- Dark navy sidebar with amber active indicators — strong brand presence on every page
- Clean white/slate content area — high information density without decorative chrome
- Large data tables, clear hierarchy, full-width Mapbox maps on trip/route detail pages
- RouteGuard icon mark in collapsed sidebar, horizontal text logo in expanded state and public pages

### Typography

- **Inter** — all UI text (excellent readability at small sizes)
- **JetBrains Mono** — API keys, device tokens, code, audit log entries

### Assets

All brand assets from `Route Guard Assets v1/`:
- `Logo_Transparent.png` — icon mark (sidebar collapsed, favicon, app icon)
- `TextLogo_Transparent.png` — horizontal lockup (sidebar expanded, marketing pages)
- `TextLogoTall_Transparent.png` — stacked lockup (login pages, splash screens)

### Driver PWA Theme

Separate dark theme: deep navy background, amber highlights, large 48px+ touch targets, high contrast — optimized for in-vehicle use on mounted tablet.

---

## 10. RBAC & Custom Roles

### Built-in System Roles

Ship with every org (`is_system = true`, locked — cannot be deleted):

| Role | Key Permissions |
|------|----------------|
| `org_admin` | Full org management, all resources |
| `school_admin` | Read schools/routes/trips, write students |
| `driver` | Read routes/trips, write trips |

### Custom Roles

Org admins can create additional roles from the full permission set:

`org:manage` · `users:manage` · `schools:read` · `schools:write` · `students:read` · `students:write` · `routes:read` · `routes:write` · `vehicles:read` · `vehicles:write` · `drivers:read` · `drivers:write` · `trips:read` · `trips:write` · `reports:read` · `settings:read` · `settings:write` · `api_keys:manage` · `devices:manage`

### SSO Role Sync

Per SSO connection, org admins map SSO groups/claims to org roles:

| claim_key | claim_value | → org_role |
|-----------|------------|-----------|
| `groups` | `"TransportAdmins"` | org_admin |
| `groups` | `"SchoolSecretaries"` | school_admin |
| `department` | `"Transportation"` | custom role |

Roles are re-evaluated and synced on every SSO login — permission changes in the IdP reflect immediately on next login.

---

*Next step: implementation plan.*
