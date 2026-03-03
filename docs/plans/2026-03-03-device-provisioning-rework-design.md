# Device Provisioning Rework - Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The current provisioning system is admin-driven and manual: a super admin creates a device record, generates a one-time token, and somehow delivers that token to the physical device. This does not scale, does not fit the actual operational workflow, and puts unnecessary complexity on RouteGuard staff.

The actual workflow is:
1. RouteGuard pre-flashes devices before shipping - one generic image per CPU architecture
2. A school receives a device, plugs it in
3. A school admin claims it via their org dashboard by entering a short code displayed on the device screen, then fills in the bus/vehicle configuration
4. The device is live in their fleet

## What We Are Removing

- `POST /admin/devices` - create device with provisioning token
- `GET /admin/devices` - list all devices
- `PATCH /admin/devices/{id}` - update device
- `DELETE /admin/devices/{id}` - revoke device
- `POST /api/v1/devices/provision` - token-based device provisioning
- `/admin/devices` device table UI
- `/admin/devices/new` create device form
- `ProvisionTokenModal` component
- All provisioning token logic (Redis keys, 72h TTL, `CreateUnprovisioned` repo method)

## Device Lifecycle (New)

```
unclaimed  ->  active  ->  revoked
```

- `unclaimed`: device has checked in from first boot, waiting for a school admin to claim it
- `active`: claimed, configured, and operational (replaces `provisioned`)
- `revoked`: disabled by admin

## Base Image Storage (RustFS)

A new `device-images` bucket in RustFS holds two objects with public read access:

```
device-images/
  arm64/routeguard-latest.img.gz    # Raspberry Pi and ARM64 SBCs
  x86-64/routeguard-latest.img.gz   # Generic UEFI x86-64 hardware
```

Images are uploaded manually (or via CI) when a new OS build is produced by the pi-gen pipeline. The API returns public URLs directly - no presigning needed since the bucket is public read.

The admin panel `/admin/devices` page is repurposed to show only two download buttons pointing at these URLs.

## API Changes

### New Endpoints

#### `POST /api/v1/devices/checkin` (unauthenticated, rate-limited)

Called by the device on first boot. Registers the device as unclaimed and returns the claim code the device should display on screen.

Request:
```json
{ "serial": "RG-2A4B-9K1M" }
```

Response `201 Created`:
```json
{ "claim_code": "X7K2M9PQ" }
```

- Inserts a device row with `status = unclaimed`, `org_id = NULL`, `claim_code = <8-char random uppercase alphanumeric>`
- Claim code is stored in the DB and expires after 7 days (checked at claim time)
- If the serial already exists and is unclaimed, returns the existing claim code (idempotent for reboots)
- If the serial already exists and is active/revoked, returns 409
- Rate-limited to 10 requests per IP per minute to prevent serial enumeration

#### `GET /api/v1/devices/checkin/status?claim_code=X7K2M9PQ` (unauthenticated, rate-limited)

Polled by the device (every 10 seconds) while displaying the claim code screen. Returns whether the device has been claimed yet and, if so, the permanent device token.

Response while pending `200 OK`:
```json
{ "status": "pending" }
```

Response after claim `200 OK`:
```json
{
  "status": "claimed",
  "device_id": "...",
  "device_token": "<raw 64-hex-char token, shown once>"
}
```

- After returning `claimed`, the server deletes the claim code from the device record
- The device stores `device_id` and `device_token` to persistent storage and reboots into normal operation
- Rate-limited to 12 requests per claim_code per minute

#### `POST /dashboard/devices/claim` (org session auth)

Called by the org dashboard when the school admin submits the claim wizard. Creates the vehicle record and claims the device in a single transaction.

Request:
```json
{
  "claim_code": "X7K2M9PQ",
  "vehicle": {
    "name": "Bus 12",
    "number": "12",
    "license_plate": "ABC-1234",
    "capacity": 48,
    "year": 2021,
    "make": "Blue Bird",
    "model": "All American"
  },
  "seat_count": 48
}
```

Response `201 Created`:
```json
{
  "device_id": "...",
  "vehicle_id": "...",
  "serial": "RG-2A4B-9K1M"
}
```

- Looks up device by claim_code - returns 404 if not found, 410 if expired (> 7 days old)
- Returns 409 if the device is already claimed
- Verifies device status is `unclaimed`
- In a single DB transaction:
  - Creates the vehicle record under the org
  - Sets device `org_id`, `vehicle_id`, `status = active`, `provisioned_at = NOW()`, clears `claim_code`
  - Generates a 32-byte raw device token, bcrypt-hashes it, stores the hash
- Returns `device_id` and `vehicle_id` (device token is delivered via the polling endpoint)

#### `GET /dashboard/devices` (org session auth)

Lists all active and unclaimed devices for the org.

Response: array of `Device` objects.

#### `GET /dashboard/devices/{id}` (org session auth)

Returns a single device with its associated vehicle.

#### `GET /admin/images` (staff session auth)

Returns public RustFS URLs for both base images.

Response:
```json
{
  "arm64": "https://storage.route-guard.com/device-images/arm64/routeguard-latest.img.gz",
  "x86_64": "https://storage.route-guard.com/device-images/x86-64/routeguard-latest.img.gz"
}
```

### Removed Endpoints

All of: `GET /admin/devices`, `POST /admin/devices`, `PATCH /admin/devices/{id}`, `DELETE /admin/devices/{id}`, `POST /api/v1/devices/provision`.

## Database Changes

### Migration: devices table

```sql
-- Make org_id nullable (unclaimed devices have no org yet)
ALTER TABLE devices ALTER COLUMN org_id DROP NOT NULL;

-- Add claim_code column
ALTER TABLE devices ADD COLUMN claim_code TEXT UNIQUE;

-- Add unclaimed status, remove unprovisioned
ALTER TABLE devices DROP CONSTRAINT devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('unclaimed', 'active', 'revoked'));
```

### Migration: device_token_hash nullable

Already done in migration 002. No change needed.

## Dashboard Changes

### Admin Panel (`/admin/devices`)

The existing device table and create form are removed. The page becomes a simple "Base Images" page with two download buttons:

```
RouteGuard Base Images

[Download ARM64 Image]    Raspberry Pi and ARM64 hardware
[Download x86-64 Image]   Generic UEFI x86-64 hardware
```

Clicking a button calls `GET /admin/images` then redirects the browser to the returned URL (direct download from RustFS).

### Org Dashboard - New Pages

#### `/dashboard/devices`

Fleet device list showing all devices for the org. Columns: serial, vehicle (name + plate), status, last seen, provisioned date. Toolbar has an "Add Device" button linking to the claim wizard.

#### `/dashboard/devices/claim`

Two-step wizard:

**Step 1 - Enter claim code**
- Single text input for the 8-character claim code displayed on the device screen
- Validates the code exists and is unclaimed on submit before advancing

**Step 2 - Configure vehicle**
- Fields: bus name, bus number, license plate, capacity, year, make, model
- All pulled from the existing `vehicles` table schema
- Submit calls `POST /dashboard/devices/claim`
- On success, redirects to `/dashboard/devices` with a success toast

#### `/dashboard/devices/[id]`

Device detail page showing: serial, status, claim code (if unclaimed), associated vehicle details, last seen timestamp. Includes an edit form for vehicle fields (calls existing vehicle PATCH endpoint).

## Security

- Claim codes are 8 uppercase alphanumeric characters (~2.8 trillion combinations), random, single-use, and expire after 7 days
- The claim endpoint is org-scoped - a school admin can only claim a device into their own org
- Checkin and status endpoints are rate-limited to prevent enumeration
- Device tokens are bcrypt-hashed at cost 12 before storage; the raw token is only visible to the device via the polling endpoint and is never logged
- No provisioning tokens or one-time Redis keys are used in the new flow

## RustFS Config

A new env var `RUSTFS_IMAGES_BUCKET` (default `device-images`) is added alongside the existing `RUSTFS_BUCKET` (avatars). The images bucket is initialized with public read policy on startup, same as the avatars bucket.

## Unclaimed Device Expiry

Unclaimed devices (status `unclaimed`) are deleted from the DB after **1 hour**. A background goroutine runs every 5 minutes and purges rows where `created_at < NOW() - INTERVAL '1 hour'` and `status = 'unclaimed'`.

When the device's claim code expires, the polling endpoint (`GET /api/v1/devices/checkin/status`) returns:
```json
{ "status": "expired" }
```

The device screen shows: "Setup session expired. Reboot the device or tap Refresh to start a new session." A **Refresh** button calls `POST /api/v1/devices/checkin` again with the same serial, which creates a new unclaimed record and claim code.

## Device Revocation

School admins (org dashboard) can revoke devices that belong to their org. Revocation sets `status = revoked` and evicts the device from the auth cache (same logic as the current `Revoke` repo method). Revoked devices are visible in the fleet list with a revoked badge but are not deleted - historical trip data is preserved.

Super admin staff retain no special revocation UI since the admin devices panel is being removed.
