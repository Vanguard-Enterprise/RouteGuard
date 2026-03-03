# Device Provisioning Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the manual admin-driven provisioning token flow with a self-service device check-in and org dashboard claim wizard, and repurpose the admin devices page to serve base image downloads from RustFS.

**Architecture:** Devices call a public `POST /api/v1/devices/checkin` endpoint on first boot, receive a short claim code, and poll for their permanent token. A school admin enters the claim code in their org dashboard, fills in vehicle config, and the device is automatically credentialed. The admin panel `/admin/devices` becomes a simple page with two download buttons (ARM64, x86-64) pointing at RustFS.

**Tech Stack:** Go 1.24 (chi router, pgx, bcrypt, aws-sdk-go-v2 for RustFS), Next.js 16 App Router, React Hook Form + Zod, shadcn/ui, Tailwind v4.

---

## Overview of Changes

**Backend removes:**
- `POST /admin/devices`, `GET /admin/devices`, `PATCH /admin/devices/{id}`, `DELETE /admin/devices/{id}`
- `POST /api/v1/devices/provision`
- `CreateUnprovisioned`, `Update`, `ListAll` repo methods
- All provisioning token Redis logic

**Backend adds:**
- `POST /api/v1/devices/checkin` - unauthenticated, rate-limited
- `GET /api/v1/devices/checkin/status` - unauthenticated, rate-limited
- `POST /dashboard/devices/claim` - org session auth
- `GET /dashboard/devices` - org session auth
- `GET /dashboard/devices/{id}` - org session auth
- `DELETE /dashboard/devices/{id}` - org session auth (revoke)
- `GET /admin/images` - staff session auth
- Background goroutine: purge unclaimed devices older than 1 hour

**Dashboard removes:**
- `/admin/devices/new` page
- `DeviceTable` component
- `ProvisionTokenModal` component

**Dashboard adds:**
- `/admin/devices` repurposed to image download page
- `/dashboard/devices` fleet list
- `/dashboard/devices/claim` two-step wizard
- `/dashboard/devices/[id]` device detail + revoke

---

## Task 1: DB Migration

**Files:**
- Create: `routeguard-api/migrations/005_device_provisioning_rework.up.sql`
- Create: `routeguard-api/migrations/005_device_provisioning_rework.down.sql`

**Step 1: Write the up migration**

```sql
-- Make org_id nullable (unclaimed devices have no org yet)
ALTER TABLE devices ALTER COLUMN org_id DROP NOT NULL;

-- Add claim_code column (8-char uppercase alphanumeric, cleared after claim)
ALTER TABLE devices ADD COLUMN claim_code TEXT UNIQUE;

-- Replace status constraint: unclaimed replaces unprovisioned, active replaces provisioned
ALTER TABLE devices DROP CONSTRAINT devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('unclaimed', 'active', 'revoked'));

-- Migrate any existing rows to the new status values
UPDATE devices SET status = 'unclaimed' WHERE status = 'unprovisioned';
UPDATE devices SET status = 'active' WHERE status = 'provisioned';

-- Drop device_token_hash NOT NULL constraint (already done in migration 002, verify no-op)
```

Save to `routeguard-api/migrations/005_device_provisioning_rework.up.sql`.

**Step 2: Write the down migration**

```sql
ALTER TABLE devices DROP COLUMN IF EXISTS claim_code;
ALTER TABLE devices ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check
  CHECK (status IN ('unprovisioned','provisioned','active','revoked'));
UPDATE devices SET status = 'unprovisioned' WHERE status = 'unclaimed';
UPDATE devices SET status = 'provisioned' WHERE status = 'active';
```

Save to `routeguard-api/migrations/005_device_provisioning_rework.down.sql`.

**Step 3: Verify migration file numbering**

Run: `ls routeguard-api/migrations/`
Expected: files go from 001 through 005 with no gaps.

**Step 4: Commit**

```bash
git add routeguard-api/migrations/005_device_provisioning_rework.up.sql
git add routeguard-api/migrations/005_device_provisioning_rework.down.sql
git commit -m "feat: add device provisioning rework migration"
```

---

## Task 2: Update Domain Type

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`

The `Device` struct needs `OrgID` to be nullable (`*string`) since unclaimed devices have no org, and a new `ClaimCode` field.

**Step 1: Update the Device struct**

Find the `Device` struct (around line 119) and change it to:

```go
// Device maps to the devices table.
type Device struct {
	ID              string          `json:"id"`
	OrgID           *string         `json:"org_id"`
	Serial          string          `json:"serial"`
	DeviceTokenHash *string         `json:"-"`
	Status          string          `json:"status"`
	ClaimCode       *string         `json:"claim_code,omitempty"`
	VehicleID       *string         `json:"vehicle_id"`
	SeatCount       *int            `json:"seat_count"`
	BusLayout       json.RawMessage `json:"bus_layout"`
	ProvisionedAt   *time.Time      `json:"provisioned_at"`
	CreatedAt       time.Time       `json:"created_at"`
}
```

**Step 2: Build to catch compile errors**

Run from `routeguard-api/`: `go build ./...`

Expected: compile errors where `device.OrgID` is used as a plain string. Fix each one - any handler that uses `device.OrgID` directly must dereference: if `d.OrgID != nil { use *d.OrgID }`. Search with: `grep -rn "\.OrgID" internal/`

The affected callers are:
- `internal/api/device_auth_handler.go` - `device.OrgID` used in `issueTripSession` calls. Change to `*device.OrgID` (safe since active devices always have OrgID set)
- `internal/api/admin_device_handler.go` - this whole file will be deleted in Task 3, ignore for now
- Audit log calls in `admin_device_handler.go` - same, being deleted

**Step 3: Build again to confirm zero errors**

Run: `go build ./...`
Expected: `exit status 0`, no output.

**Step 4: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git add routeguard-api/internal/api/device_auth_handler.go
git commit -m "feat: make Device.OrgID nullable, add ClaimCode field"
```

---

## Task 3: Remove Old Provisioning Code

**Files:**
- Delete: `routeguard-api/internal/api/admin_device_handler.go`
- Modify: `routeguard-api/internal/api/device_auth_handler.go` (remove ProvisionDevice and provisionTokenPayload)
- Modify: `routeguard-api/internal/repository/device_repo.go` (remove CreateUnprovisioned, Update, ListAll)
- Modify: `routeguard-api/internal/server/server.go` (remove old routes)

**Step 1: Delete admin_device_handler.go**

```bash
rm routeguard-api/internal/api/admin_device_handler.go
```

**Step 2: Remove ProvisionDevice from device_auth_handler.go**

In `routeguard-api/internal/api/device_auth_handler.go`, delete:
- The `provisionTokenPayload` struct (lines 27-30)
- The `provisionRequest` struct (lines 33-35)
- The `ProvisionDevice` handler function (lines 74-124)
- The `provisionTokenPrefix` and `provisionTokenTTL` constants (they were in admin_device_handler.go - already gone, but verify no dangling references)

**Step 3: Remove obsolete repo methods from device_repo.go**

In `routeguard-api/internal/repository/device_repo.go`, delete:
- `CreateUnprovisioned` method
- `Update` method
- `ListAll` method

**Step 4: Remove old routes from server.go**

In `routeguard-api/internal/server/server.go`, find the device routes block and:

Remove:
```go
r.With(middleware.RateLimit(s.cache, 20)).Post("/api/v1/devices/provision", h.ProvisionDevice)
```

And inside the admin `r.Route("/admin", ...)` block, remove:
```go
r.Get("/devices", h.ListAdminDevices)
r.Post("/devices", h.CreateAdminDevice)
r.Patch("/devices/{id}", h.UpdateAdminDevice)
r.Delete("/devices/{id}", h.DeleteAdminDevice)
```

**Step 5: Build to confirm clean compile**

Run: `go build ./...`
Expected: no errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove old admin device provisioning code"
```

---

## Task 4: Update Device Repository

**Files:**
- Modify: `routeguard-api/internal/repository/device_repo.go`

Replace the old scan patterns (OrgID was `string`, now `*string`) and add new methods.

**Step 1: Fix all existing Scan calls for the new schema**

Every `rows.Scan(...)` and `QueryRow(...).Scan(...)` in device_repo.go that reads a device must now scan `claim_code` as well. The new full scan order matches the updated SELECT:

```go
// Full device SELECT - use this order everywhere
const deviceSelect = `
    SELECT id, org_id, serial, device_token_hash, status, claim_code,
           vehicle_id, seat_count, bus_layout, provisioned_at, created_at
    FROM devices`
```

Update every scan in the file to match:
```go
rows.Scan(
    &d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status, &d.ClaimCode,
    &d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
)
```

`OrgID` is `*string` - pgx handles NULL -> nil automatically.
`ClaimCode` is `*string` - same.

**Step 2: Add CreateUnclaimed method**

```go
// generateClaimCode creates a cryptographically random 8-character uppercase
// alphanumeric claim code. The character set is A-Z + 0-9 (36 chars).
func generateClaimCode() (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	code := make([]byte, 8)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		code[i] = charset[n.Int64()]
	}
	return string(code), nil
}

// CreateUnclaimed inserts a new device with status 'unclaimed', no org, and
// a random claim code. If the serial already exists and is unclaimed, returns
// the existing record (idempotent for device reboots).
func (r *DeviceRepo) CreateUnclaimed(ctx context.Context, serial string) (*domain.Device, error) {
	// Check if an unclaimed record already exists for this serial.
	var existing domain.Device
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, serial, device_token_hash, status, claim_code,
		       vehicle_id, seat_count, bus_layout, provisioned_at, created_at
		FROM devices WHERE serial = $1 AND status = 'unclaimed'
	`, serial).Scan(
		&existing.ID, &existing.OrgID, &existing.Serial, &existing.DeviceTokenHash,
		&existing.Status, &existing.ClaimCode, &existing.VehicleID, &existing.SeatCount,
		&existing.BusLayout, &existing.ProvisionedAt, &existing.CreatedAt,
	)
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("create unclaimed: check existing: %w", err)
	}

	code, err := generateClaimCode()
	if err != nil {
		return nil, fmt.Errorf("create unclaimed: generate code: %w", err)
	}

	var d domain.Device
	err = r.pool.QueryRow(ctx, `
		INSERT INTO devices (serial, status, claim_code)
		VALUES ($1, 'unclaimed', $2)
		RETURNING id, org_id, serial, device_token_hash, status, claim_code,
		          vehicle_id, seat_count, bus_layout, provisioned_at, created_at
	`, serial, code).Scan(
		&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status, &d.ClaimCode,
		&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create unclaimed: insert: %w", err)
	}
	return &d, nil
}
```

Add `"math/big"` and `"crypto/rand"` to imports if not already present.

**Step 3: Add FindByClaimCode method**

```go
// FindByClaimCode looks up an unclaimed device by its claim code.
// Returns pgx.ErrNoRows if not found.
func (r *DeviceRepo) FindByClaimCode(ctx context.Context, claimCode string) (*domain.Device, error) {
	var d domain.Device
	err := r.pool.QueryRow(ctx, `
		SELECT id, org_id, serial, device_token_hash, status, claim_code,
		       vehicle_id, seat_count, bus_layout, provisioned_at, created_at
		FROM devices WHERE claim_code = $1
	`, claimCode).Scan(
		&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status, &d.ClaimCode,
		&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}
```

**Step 4: Add Claim method**

```go
// Claim associates an unclaimed device with an org and vehicle, sets status to
// active, stores the device token hash, and clears the claim code.
// Runs inside a transaction provided by the caller.
func (r *DeviceRepo) Claim(ctx context.Context, tx pgx.Tx, deviceID, orgID, vehicleID, tokenHash string) error {
	tag, err := tx.Exec(ctx, `
		UPDATE devices
		SET org_id = $1, vehicle_id = $2, device_token_hash = $3,
		    status = 'active', provisioned_at = NOW(), claim_code = NULL
		WHERE id = $4 AND status = 'unclaimed'
	`, orgID, vehicleID, tokenHash, deviceID)
	if err != nil {
		return fmt.Errorf("claim device: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
```

**Step 5: Add ListByOrg method (for org dashboard)**

```go
// ListByOrg returns all non-revoked devices for the given org, ordered newest first.
func (r *DeviceRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.Device, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, serial, device_token_hash, status, claim_code,
		       vehicle_id, seat_count, bus_layout, provisioned_at, created_at
		FROM devices
		WHERE org_id = $1
		ORDER BY created_at DESC
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list devices by org: %w", err)
	}
	defer rows.Close()
	devices := make([]domain.Device, 0)
	for rows.Next() {
		var d domain.Device
		if err := rows.Scan(
			&d.ID, &d.OrgID, &d.Serial, &d.DeviceTokenHash, &d.Status, &d.ClaimCode,
			&d.VehicleID, &d.SeatCount, &d.BusLayout, &d.ProvisionedAt, &d.CreatedAt,
		); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}
```

**Step 6: Add DeleteExpiredUnclaimed method**

```go
// DeleteExpiredUnclaimed removes unclaimed device records older than 1 hour.
// Called by the background cleanup goroutine every 5 minutes.
func (r *DeviceRepo) DeleteExpiredUnclaimed(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM devices
		WHERE status = 'unclaimed' AND created_at < NOW() - INTERVAL '1 hour'
	`)
	if err != nil {
		return 0, fmt.Errorf("delete expired unclaimed: %w", err)
	}
	return tag.RowsAffected(), nil
}
```

**Step 7: Build**

Run: `go build ./...`
Expected: no errors.

**Step 8: Commit**

```bash
git add routeguard-api/internal/repository/device_repo.go
git commit -m "feat: update device repo for claim-based provisioning"
```

---

## Task 5: Device Check-in Endpoint

**Files:**
- Create: `routeguard-api/internal/api/device_checkin_handler.go`
- Create: `routeguard-api/internal/api/device_checkin_handler_test.go`

**Step 1: Write the failing test**

```go
package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeviceCheckin_MissingSerial(t *testing.T) {
	h := &Handler{}
	body := `{}`
	r := httptest.NewRequest(http.MethodPost, "/api/v1/devices/checkin", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.DeviceCheckin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeviceCheckin_InvalidBody(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/devices/checkin", strings.NewReader("not json"))
	w := httptest.NewRecorder()
	h.DeviceCheckin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want %d", w.Code, http.StatusBadRequest)
	}
}
```

**Step 2: Run to verify failure**

Run: `go test -v -run TestDeviceCheckin ./internal/api/`
Expected: FAIL - `h.DeviceCheckin undefined`

**Step 3: Implement the handler**

Create `routeguard-api/internal/api/device_checkin_handler.go`:

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/repository"
)

type checkinRequest struct {
	Serial string `json:"serial"`
}

type checkinResponse struct {
	ClaimCode string `json:"claim_code"`
}

// DeviceCheckin handles POST /api/v1/devices/checkin.
// Unauthenticated. Called by a device on first boot.
// Creates an unclaimed device record and returns the claim code to display on screen.
// Idempotent: if the serial already has an unclaimed record, returns its existing code.
func (h *Handler) DeviceCheckin(w http.ResponseWriter, r *http.Request) {
	var req checkinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Serial == "" {
		Error(w, http.StatusBadRequest, "serial is required")
		return
	}

	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.CreateUnclaimed(r.Context(), req.Serial)
	if err != nil {
		// 23505 = unique_violation: serial already exists and is not unclaimed
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "device with this serial is already active or revoked")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, checkinResponse{
		ClaimCode: *device.ClaimCode,
	})
}

type checkinStatusResponse struct {
	Status      string  `json:"status"`
	DeviceID    *string `json:"device_id,omitempty"`
	DeviceToken *string `json:"device_token,omitempty"`
}

// DeviceCheckinStatus handles GET /api/v1/devices/checkin/status?claim_code=XXXXXXXX.
// Unauthenticated. Polled by the device every 10 seconds while showing the claim code screen.
// Returns pending, expired, or claimed+token.
func (h *Handler) DeviceCheckinStatus(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("claim_code")
	if code == "" {
		Error(w, http.StatusBadRequest, "claim_code is required")
		return
	}

	// Check Redis for a claimed token waiting for the device.
	claimKey := "device_claim_result:" + code
	var claimResult deviceClaimResult
	if err := h.cache.Get(r.Context(), claimKey, &claimResult); err == nil {
		// Token is ready - delete it (single use) and return to device.
		_ = h.cache.Del(r.Context(), claimKey)
		JSON(w, http.StatusOK, checkinStatusResponse{
			Status:      "claimed",
			DeviceID:    &claimResult.DeviceID,
			DeviceToken: &claimResult.DeviceToken,
		})
		return
	}

	// No token in Redis yet - check DB for pending/expired.
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.FindByClaimCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Claim code doesn't exist - either expired (deleted) or never existed.
			JSON(w, http.StatusOK, checkinStatusResponse{Status: "expired"})
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	_ = device
	JSON(w, http.StatusOK, checkinStatusResponse{Status: "pending"})
}

// deviceClaimResult is stored in Redis under "device_claim_result:<claim_code>"
// after the org admin claims the device. TTL: 10 minutes.
type deviceClaimResult struct {
	DeviceID    string `json:"device_id"`
	DeviceToken string `json:"device_token"`
}
```

Also add `isUniqueViolation` helper if it doesn't exist. Check for it in the existing handler files:

```bash
grep -rn "isUniqueViolation\|23505" routeguard-api/internal/api/
```

If it doesn't exist, add to `routeguard-api/internal/api/handler.go`:
```go
// isUniqueViolation returns true if err is a PostgreSQL unique constraint violation.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
```

**Step 4: Run tests**

Run: `go test -v -run TestDeviceCheckin ./internal/api/`
Expected: PASS

**Step 5: Commit**

```bash
git add routeguard-api/internal/api/device_checkin_handler.go
git add routeguard-api/internal/api/device_checkin_handler_test.go
git commit -m "feat: add device checkin and status polling endpoints"
```

---

## Task 6: Org Dashboard Claim Endpoint

**Files:**
- Create: `routeguard-api/internal/api/dashboard_device_handler.go`

**Step 1: Write the handler**

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
)

const deviceClaimResultTTL = 10 * time.Minute

type claimDeviceRequest struct {
	ClaimCode string         `json:"claim_code"`
	Vehicle   claimVehicle   `json:"vehicle"`
	SeatCount *int           `json:"seat_count"`
}

type claimVehicle struct {
	Name         string  `json:"name"`
	Number       *string `json:"number"`
	LicensePlate *string `json:"license_plate"`
	Capacity     *int    `json:"capacity"`
	Year         *int    `json:"year"`
	Make         *string `json:"make"`
	Model        *string `json:"model"`
}

type claimDeviceResponse struct {
	DeviceID  string `json:"device_id"`
	VehicleID string `json:"vehicle_id"`
	Serial    string `json:"serial"`
}

// ClaimDevice handles POST /dashboard/devices/claim.
// Org session auth required. Validates a claim code, creates a vehicle record,
// and associates the device with the org. The permanent device token is
// deposited in Redis for the device to pick up via the status polling endpoint.
func (h *Handler) ClaimDevice(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req claimDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ClaimCode == "" {
		Error(w, http.StatusBadRequest, "claim_code is required")
		return
	}
	if req.Vehicle.Name == "" {
		Error(w, http.StatusBadRequest, "vehicle.name is required")
		return
	}

	deviceRepo := repository.NewDeviceRepo(h.pool)
	device, err := deviceRepo.FindByClaimCode(r.Context(), req.ClaimCode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "claim code not found or expired")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if device.Status != "unclaimed" {
		Error(w, http.StatusConflict, "device has already been claimed")
		return
	}
	// Check expiry (1 hour).
	if time.Since(device.CreatedAt) > time.Hour {
		Error(w, http.StatusGone, "claim code has expired - reboot the device to generate a new one")
		return
	}

	// Generate permanent device token.
	rawToken, err := generateDeviceToken()
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	tokenHash, err := crypto.HashPassword(rawToken)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Run in a transaction: create vehicle + claim device.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer tx.Rollback(r.Context())

	vehicleRepo := repository.NewVehicleRepo(h.pool)
	vehicle, err := vehicleRepo.CreateTx(r.Context(), tx, session.OrgID, req.Vehicle.Name,
		req.Vehicle.Number, req.Vehicle.LicensePlate, req.Vehicle.Capacity,
		req.Vehicle.Year, req.Vehicle.Make, req.Vehicle.Model)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := deviceRepo.Claim(r.Context(), tx, device.ID, session.OrgID, vehicle.ID, tokenHash); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Deposit raw token in Redis for the device to pick up via status polling.
	claimResult := deviceClaimResult{DeviceID: device.ID, DeviceToken: rawToken}
	_ = h.cache.Set(r.Context(), "device_claim_result:"+req.ClaimCode, claimResult, deviceClaimResultTTL)

	JSON(w, http.StatusCreated, claimDeviceResponse{
		DeviceID:  device.ID,
		VehicleID: vehicle.ID,
		Serial:    device.Serial,
	})
}

// ListMyDevices handles GET /dashboard/devices.
func (h *Handler) ListMyDevices(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	repo := repository.NewDeviceRepo(h.pool)
	devices, err := repo.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, devices)
}

// GetMyDevice handles GET /dashboard/devices/{id}.
func (h *Handler) GetMyDevice(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	// Ensure device belongs to this org.
	if device.OrgID == nil || *device.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "device not found")
		return
	}
	JSON(w, http.StatusOK, device)
}

// RevokeMyDevice handles DELETE /dashboard/devices/{id}.
// Sets device status to revoked and evicts from cache.
func (h *Handler) RevokeMyDevice(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")

	// Verify ownership before revoking.
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if device.OrgID == nil || *device.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "device not found")
		return
	}

	if err := repo.Revoke(r.Context(), id, h.cache); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}
```

Note: `VehicleRepo.CreateTx` is a new method added in Task 7.

**Step 2: Build**

Run: `go build ./...`
Expected: error on `vehicleRepo.CreateTx` - this gets resolved in Task 7.

**Step 3: Commit after Task 7 resolves the build**

Hold commit until Task 7 is done.

---

## Task 7: VehicleRepo.CreateTx

**Files:**
- Modify: `routeguard-api/internal/repository/vehicle_repo.go` (add `CreateTx` method)

First, check if a VehicleRepo exists:
```bash
ls routeguard-api/internal/repository/vehicle_repo.go
```

If it does not exist, create it. If it does, add the method.

**Step 1: Add CreateTx to vehicle_repo.go**

```go
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type VehicleRepo struct {
	pool *pgxpool.Pool
}

func NewVehicleRepo(pool *pgxpool.Pool) *VehicleRepo {
	return &VehicleRepo{pool: pool}
}

// CreateTx inserts a new vehicle record inside the provided transaction.
func (r *VehicleRepo) CreateTx(ctx context.Context, tx pgx.Tx, orgID, name string,
	number, licensePlate *string, capacity, year *int, make, model *string,
) (*domain.Vehicle, error) {
	var v domain.Vehicle
	err := tx.QueryRow(ctx, `
		INSERT INTO vehicles (org_id, name, number, license_plate, capacity, year, make, model)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, org_id, name, number, capacity, year, make, model, vin,
		          license_plate, status, created_at, updated_at
	`, orgID, name, number, licensePlate, capacity, year, make, model).Scan(
		&v.ID, &v.OrgID, &v.Name, &v.Number, &v.Capacity, &v.Year,
		&v.Make, &v.Model, &v.VIN, &v.LicensePlate, &v.Status,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create vehicle tx: %w", err)
	}
	return &v, nil
}
```

Check the `domain.Vehicle` struct to confirm field names match. Run:
```bash
grep -A 20 "type Vehicle struct" routeguard-api/internal/domain/types.go
```

Align field names with whatever is in the domain type.

**Step 2: Build**

Run: `go build ./...`
Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/vehicle_repo.go
git add routeguard-api/internal/api/dashboard_device_handler.go
git commit -m "feat: add dashboard device claim, list, detail, revoke handlers"
```

---

## Task 8: Admin Images Endpoint

**Files:**
- Create: `routeguard-api/internal/api/admin_images_handler.go`
- Modify: `routeguard-api/internal/config/config.go` (add RUSTFS_IMAGES_BUCKET)
- Modify: `routeguard-api/internal/server/server.go` (add routes, init images bucket)
- Modify: `routeguard-api/cmd/api/main.go` if storage client init needs updating

**Step 1: Add RUSTFS_IMAGES_BUCKET to config**

In `routeguard-api/internal/config/config.go`, add alongside the existing RustFS fields:

```go
RustFSImagesBucket  string
RustFSImagesPublicURL string
```

And in the loader:
```go
RustFSImagesBucket:   envOr("RUSTFS_IMAGES_BUCKET", "device-images"),
RustFSImagesPublicURL: envOr("RUSTFS_IMAGES_PUBLIC_URL", "http://localhost:9000/device-images"),
```

**Step 2: Create admin_images_handler.go**

```go
package api

import (
	"net/http"
)

type baseImagesResponse struct {
	ARM64 string `json:"arm64"`
	X8664 string `json:"x86_64"`
}

// GetBaseImages handles GET /admin/images.
// Returns public RustFS URLs for the ARM64 and x86-64 base device images.
func (h *Handler) GetBaseImages(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, baseImagesResponse{
		ARM64: h.imagesPublicURL + "/arm64/routeguard-latest.img.gz",
		X8664: h.imagesPublicURL + "/x86-64/routeguard-latest.img.gz",
	})
}
```

**Step 3: Add imagesPublicURL field to Handler**

In `routeguard-api/internal/api/handler.go`, find the `Handler` struct and add:
```go
imagesPublicURL string
```

Update the constructor (`NewHandler` or however the Handler is initialized) to accept and store this value.

**Step 4: Wire route in server.go**

Inside the admin `r.Route("/admin", ...)` block, add:
```go
r.Get("/images", h.GetBaseImages)
```

**Step 5: Pass imagesPublicURL when constructing Handler**

Find where `Handler` is constructed in `cmd/api/main.go` or `server.go` and pass `cfg.RustFSImagesPublicURL`.

**Step 6: Build**

Run: `go build ./...`
Expected: no errors.

**Step 7: Commit**

```bash
git add routeguard-api/internal/api/admin_images_handler.go
git add routeguard-api/internal/api/handler.go
git add routeguard-api/internal/config/config.go
git add routeguard-api/internal/server/server.go
git commit -m "feat: add admin images endpoint for base image downloads"
```

---

## Task 9: Background Unclaimed Device Cleanup

**Files:**
- Create: `routeguard-api/internal/cleanup/cleanup.go`
- Modify: `routeguard-api/cmd/api/main.go`

**Step 1: Create cleanup.go**

```go
package cleanup

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/repository"
)

// StartUnclaimedDevicePurge starts a background goroutine that deletes unclaimed
// device records older than 1 hour. Runs every 5 minutes until ctx is cancelled.
func StartUnclaimedDevicePurge(ctx context.Context, pool *pgxpool.Pool) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				repo := repository.NewDeviceRepo(pool)
				n, err := repo.DeleteExpiredUnclaimed(ctx)
				if err != nil {
					log.Error().Err(err).Msg("cleanup: failed to purge expired unclaimed devices")
				} else if n > 0 {
					log.Info().Int64("count", n).Msg("cleanup: purged expired unclaimed devices")
				}
			}
		}
	}()
}
```

**Step 2: Start it in main.go**

In `routeguard-api/cmd/api/main.go`, after the server is initialized and before `srv.ListenAndServe`, add:

```go
cleanup.StartUnclaimedDevicePurge(ctx, pool)
```

Import: `"github.com/routeguard/api/internal/cleanup"`

**Step 3: Build**

Run: `go build ./...`
Expected: no errors.

**Step 4: Commit**

```bash
git add routeguard-api/internal/cleanup/cleanup.go
git add routeguard-api/cmd/api/main.go
git commit -m "feat: background goroutine to purge expired unclaimed devices"
```

---

## Task 10: Wire New API Routes

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Add all new routes**

In `server.go`, add to the appropriate sections:

```go
// Device check-in (unauthenticated, rate-limited)
r.With(middleware.RateLimit(s.cache, 10)).Post("/api/v1/devices/checkin", h.DeviceCheckin)
r.With(middleware.RateLimit(s.cache, 12)).Get("/api/v1/devices/checkin/status", h.DeviceCheckinStatus)
```

Inside `r.Route("/dashboard", ...)`:
```go
// Devices
r.With(middleware.RequirePermission("devices:read")).Get("/devices", h.ListMyDevices)
r.With(middleware.RequirePermission("devices:write")).Post("/devices/claim", h.ClaimDevice)
r.With(middleware.RequirePermission("devices:read")).Get("/devices/{id}", h.GetMyDevice)
r.With(middleware.RequirePermission("devices:write")).Delete("/devices/{id}", h.RevokeMyDevice)
```

**Step 2: Build and run all tests**

Run: `go build ./... && go test -v ./...`
Expected: all pass.

**Step 3: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire device checkin and dashboard device routes"
```

---

## Task 11: Update Dashboard API Client

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add Device type updates**

Find the `Device` type in `lib/api.ts` and update `org_id` to be nullable and add `claim_code`:

```typescript
export interface Device {
  id: string
  org_id: string | null
  serial: string
  status: 'unclaimed' | 'active' | 'revoked'
  claim_code?: string
  vehicle_id: string | null
  seat_count: number | null
  bus_layout: unknown | null
  provisioned_at: string | null
  created_at: string
}

export interface ClaimDeviceRequest {
  claim_code: string
  vehicle: {
    name: string
    number?: string
    license_plate?: string
    capacity?: number
    year?: number
    make?: string
    model?: string
  }
  seat_count?: number
}

export interface BaseImages {
  arm64: string
  x86_64: string
}
```

**Step 2: Remove old admin device methods, add new ones**

In the `api` object, replace the old `admin.devices` block and add new sections:

```typescript
admin: {
  // ...existing admin methods...
  images: {
    get: () => request<BaseImages>('/admin/images'),
  },
  // Remove: admin.devices entirely
},

dashboard: {
  // ...existing dashboard methods...
  devices: {
    list: () => request<Device[]>('/dashboard/devices'),
    get: (id: string) => request<Device>(`/dashboard/devices/${id}`),
    claim: (data: ClaimDeviceRequest) =>
      request<{ device_id: string; vehicle_id: string; serial: string }>(
        '/dashboard/devices/claim',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    revoke: (id: string) => request<void>(`/dashboard/devices/${id}`, { method: 'DELETE' }),
  },
},
```

**Step 3: Lint**

Run: `cd dashboard && npm run lint`
Expected: 0 errors.

**Step 4: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: update API client for new device provisioning model"
```

---

## Task 12: Repurpose Admin Devices Page

**Files:**
- Modify: `dashboard/app/admin/devices/page.tsx` (replace content)
- Delete: `dashboard/app/admin/devices/new/` (entire directory)
- Delete: `dashboard/components/admin/device-table.tsx`
- Delete: `dashboard/components/admin/provision-token-modal.tsx`

**Step 1: Delete obsolete files**

```bash
rm -rf dashboard/app/admin/devices/new
rm dashboard/components/admin/device-table.tsx
rm dashboard/components/admin/provision-token-modal.tsx
```

**Step 2: Replace admin/devices/page.tsx**

```tsx
import { api } from '@/lib/api'

export const metadata = {
  title: 'Device Images - RouteGuard',
}

async function getImages() {
  try {
    return await api.admin.images.get()
  } catch {
    return null
  }
}

export default async function DeviceImagesPage() {
  const images = await getImages()

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-brand-navy)' }}>
        Device Base Images
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Flash one of these images to RouteGuard hardware before shipping.
        The device will check in automatically on first boot and display a claim code.
      </p>

      {!images ? (
        <p className="text-sm text-red-600">Failed to load image URLs.</p>
      ) : (
        <div className="space-y-3">
          <ImageDownloadCard
            label="ARM64"
            description="Raspberry Pi and ARM64 single-board computers"
            url={images.arm64}
          />
          <ImageDownloadCard
            label="x86-64"
            description="Generic UEFI x86-64 hardware"
            url={images.x86_64}
          />
        </div>
      )}
    </div>
  )
}

function ImageDownloadCard({
  label,
  description,
  url,
}: {
  label: string
  description: string
  url: string
}) {
  return (
    <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <a
        href={url}
        download
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--color-brand-navy)' }}
      >
        Download
      </a>
    </div>
  )
}
```

**Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: no TypeScript errors.

**Step 4: Commit**

```bash
git add dashboard/app/admin/devices/page.tsx
git add -A dashboard/app/admin/devices/
git add -A dashboard/components/admin/
git commit -m "feat: repurpose admin devices page to image downloads"
```

---

## Task 13: Org Dashboard - Fleet Device List

**Files:**
- Create: `dashboard/app/dashboard/devices/page.tsx`
- Create: `dashboard/components/dashboard/device-table.tsx`
- Modify: `dashboard/components/dashboard/app-sidebar.tsx`

**Step 1: Add Devices to sidebar**

In `app-sidebar.tsx`, add after the Vehicles entry:
```tsx
{ href: '/dashboard/devices', label: 'Devices', icon: Tablet, permission: 'devices:read' },
```

Import `Tablet` from `lucide-react`.

**Step 2: Create device-table.tsx**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, ArrowUpDown } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { api, Device } from '@/lib/api'
import { DataTable } from '@/components/dashboard/data-table'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700 border-green-200' },
  unclaimed: { label: 'Unclaimed', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  revoked: { label: 'Revoked', className: 'bg-red-50 text-red-700 border-red-200' },
}

export default function DeviceTable({ devices: initial }: { devices: Device[] }) {
  const [devices, setDevices] = useState(initial)
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null)
  const [revoking, setRevoking] = useState(false)

  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await api.dashboard.devices.revoke(revokeTarget.id)
      setDevices((prev) =>
        prev.map((d) => d.id === revokeTarget.id ? { ...d, status: 'revoked' } : d)
      )
      setRevokeTarget(null)
    } catch {
      alert('Failed to revoke device.')
    } finally {
      setRevoking(false)
    }
  }

  const columns: ColumnDef<Device>[] = [
    {
      accessorKey: 'serial',
      header: ({ column }) => (
        <Button variant="ghost" size="sm" className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Serial <ArrowUpDown className="ml-2 size-3.5" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.serial}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = STATUS_STYLES[row.original.status] ?? { label: row.original.status, className: 'bg-gray-100 text-gray-600 border-gray-200' }
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.className}`}>
            {s.label}
          </span>
        )
      },
    },
    {
      accessorKey: 'provisioned_at',
      header: 'Provisioned',
      cell: ({ row }) => row.original.provisioned_at
        ? new Date(row.original.provisioned_at).toLocaleDateString()
        : '—',
    },
    {
      id: 'actions',
      enableHiding: false,
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Link href={`/dashboard/devices/${row.original.id}`}
            className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground transition-colors text-xs">
            View
          </Link>
          {row.original.status !== 'revoked' && (
            <button onClick={() => setRevokeTarget(row.original)}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Revoke">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <DataTable
        columns={columns}
        data={devices}
        toolbar={
          <Link href="/dashboard/devices/claim"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={15} /> Add Device
          </Link>
        }
      />
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke device?</AlertDialogTitle>
            <AlertDialogDescription>
              Device <strong>{revokeTarget?.serial}</strong> will be immediately locked out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revoking}
              className="bg-destructive hover:bg-destructive/90">
              {revoking ? 'Revoking...' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

Note: use whatever data table component exists in the dashboard. Check `components/dashboard/` for a `DataTable` or `data-table.tsx` and use its import path.

**Step 3: Create devices/page.tsx**

```tsx
import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import DeviceTable from '@/components/dashboard/device-table'

async function getDevices() {
  try {
    return await api.dashboard.devices.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) redirect('/staff/login')
    return []
  }
}

export const metadata = { title: 'Devices - RouteGuard' }

export default async function DevicesPage() {
  const devices = await getDevices()
  return <DeviceTable devices={devices} />
}
```

**Step 4: Build and lint**

Run: `cd dashboard && npm run lint && npm run build`
Expected: 0 errors.

**Step 5: Commit**

```bash
git add dashboard/app/dashboard/devices/page.tsx
git add dashboard/components/dashboard/device-table.tsx
git add dashboard/components/dashboard/app-sidebar.tsx
git commit -m "feat: org dashboard device fleet list page"
```

---

## Task 14: Org Dashboard - Claim Wizard

**Files:**
- Create: `dashboard/app/dashboard/devices/claim/page.tsx`

Two steps: (1) enter claim code, (2) configure vehicle. The first step validates the code via a lightweight check before advancing. Use `useState` for step tracking.

**Step 1: Create claim/page.tsx**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, APIError } from '@/lib/api'
import { toast } from 'sonner'

const codeSchema = z.object({
  claim_code: z.string().length(8, 'Claim code must be 8 characters').toUpperCase(),
})

const vehicleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  number: z.string().optional(),
  license_plate: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
})

type CodeForm = z.infer<typeof codeSchema>
type VehicleForm = z.infer<typeof vehicleSchema>

export default function ClaimDevicePage() {
  const router = useRouter()
  const [step, setStep] = useState<'code' | 'vehicle'>('code')
  const [claimCode, setClaimCode] = useState('')

  const codeForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })
  const vehicleForm = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema) })

  async function onCodeSubmit(data: CodeForm) {
    setClaimCode(data.claim_code)
    setStep('vehicle')
  }

  async function onVehicleSubmit(data: VehicleForm) {
    try {
      await api.dashboard.devices.claim({
        claim_code: claimCode,
        vehicle: {
          name: data.name,
          number: data.number || undefined,
          license_plate: data.license_plate || undefined,
          capacity: data.capacity,
          year: data.year,
          make: data.make || undefined,
          model: data.model || undefined,
        },
      })
      toast.success('Device added to your fleet')
      router.push('/dashboard/devices')
      router.refresh()
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Failed to add device'
      if (err instanceof APIError && (err.status === 404 || err.status === 410)) {
        toast.error('Claim code expired or not found. Reboot the device for a new code.')
        setStep('code')
        return
      }
      toast.error(msg)
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        Add Device
      </h1>

      <div className="flex items-center gap-2 mb-6">
        {['code', 'vehicle'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
              ${step === s ? 'bg-brand-navy text-white' : i < ['code','vehicle'].indexOf(step) ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}
              style={step === s ? { backgroundColor: 'var(--color-brand-navy)' } : {}}>
              {i + 1}
            </div>
            <span className="text-sm text-gray-500">{s === 'code' ? 'Claim Code' : 'Bus Info'}</span>
            {i < 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {step === 'code' && (
          <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
            <p className="text-sm text-gray-500">
              Power on the RouteGuard device. A claim code will appear on the device screen.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim Code
              </label>
              <input
                {...codeForm.register('claim_code')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono uppercase outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="XXXXXXXX"
                maxLength={8}
                autoComplete="off"
              />
              {codeForm.formState.errors.claim_code && (
                <p className="mt-1 text-xs text-red-500">{codeForm.formState.errors.claim_code.message}</p>
              )}
            </div>
            <button type="submit"
              className="w-full px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}>
              Next
            </button>
          </form>
        )}

        {step === 'vehicle' && (
          <form onSubmit={vehicleForm.handleSubmit(onVehicleSubmit)} className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter the details for the bus this device is installed in.
            </p>
            {(
              [
                { id: 'name', label: 'Bus Name', required: true, placeholder: 'Bus 12' },
                { id: 'number', label: 'Bus Number', placeholder: '12' },
                { id: 'license_plate', label: 'License Plate', placeholder: 'ABC-1234' },
                { id: 'capacity', label: 'Capacity', placeholder: '48', type: 'number' },
                { id: 'year', label: 'Year', placeholder: '2021', type: 'number' },
                { id: 'make', label: 'Make', placeholder: 'Blue Bird' },
                { id: 'model', label: 'Model', placeholder: 'All American' },
              ] as const
            ).map(({ id, label, required, placeholder, type }) => (
              <div key={id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  {...vehicleForm.register(id as keyof VehicleForm)}
                  type={type ?? 'text'}
                  placeholder={placeholder}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                {vehicleForm.formState.errors[id as keyof VehicleForm] && (
                  <p className="mt-1 text-xs text-red-500">
                    {vehicleForm.formState.errors[id as keyof VehicleForm]?.message}
                  </p>
                )}
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep('code')}
                className="px-5 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button type="submit"
                disabled={vehicleForm.formState.isSubmitting}
                className="flex-1 px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-brand-navy)' }}>
                {vehicleForm.formState.isSubmitting ? 'Adding...' : 'Add Device'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Build and lint**

Run: `cd dashboard && npm run lint && npm run build`
Expected: 0 errors.

**Step 3: Commit**

```bash
git add dashboard/app/dashboard/devices/claim/page.tsx
git commit -m "feat: device claim wizard for org dashboard"
```

---

## Task 15: Org Dashboard - Device Detail Page

**Files:**
- Create: `dashboard/app/dashboard/devices/[id]/page.tsx`

**Step 1: Create the detail page**

```tsx
import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'

async function getDevice(id: string) {
  try {
    return await api.dashboard.devices.get(id)
  } catch (err) {
    if (err instanceof APIError && err.status === 401) redirect('/staff/login')
    if (err instanceof APIError && err.status === 404) notFound()
    throw err
  }
}

export const metadata = { title: 'Device - RouteGuard' }

export default async function DeviceDetailPage({ params }: { params: { id: string } }) {
  const device = await getDevice(params.id)

  const fields = [
    { label: 'Serial', value: device.serial },
    { label: 'Status', value: device.status },
    { label: 'Vehicle ID', value: device.vehicle_id ?? '—' },
    { label: 'Seat Count', value: device.seat_count?.toString() ?? '—' },
    {
      label: 'Provisioned',
      value: device.provisioned_at
        ? new Date(device.provisioned_at).toLocaleString()
        : '—',
    },
    { label: 'Created', value: new Date(device.created_at).toLocaleString() },
  ]

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        Device
      </h1>

      {device.status === 'unclaimed' && device.claim_code && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Waiting to be claimed</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Claim code: <span className="font-mono font-bold">{device.claim_code}</span>
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm font-medium text-gray-900 font-mono">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Build and lint**

Run: `cd dashboard && npm run lint && npm run build`
Expected: 0 errors.

**Step 3: Final build + test run**

```bash
cd routeguard-api && go test -v ./...
cd ../dashboard && npm run lint && npm run build
```

Expected: all Go tests pass, 0 lint errors, build succeeds.

**Step 4: Commit**

```bash
git add dashboard/app/dashboard/devices/[id]/page.tsx
git commit -m "feat: device detail page for org dashboard"
```

---

## Final Verification Checklist

- [ ] `go build ./...` passes with zero errors
- [ ] `go test -v ./...` all pass
- [ ] `npm run lint` 0 errors
- [ ] `npm run build` no TypeScript errors
- [ ] Migration 005 up/down pair exists and is sequentially numbered
- [ ] `/admin/devices` shows only ARM64 and x86-64 download buttons
- [ ] `/admin/devices/new` no longer exists (404)
- [ ] `/dashboard/devices` shows org fleet
- [ ] `/dashboard/devices/claim` two-step wizard works end-to-end
- [ ] `/dashboard/devices/[id]` shows device detail with revoke option
- [ ] Old `/api/v1/devices/provision` route removed (returns 404)
- [ ] New `/api/v1/devices/checkin` and `/api/v1/devices/checkin/status` routes exist
