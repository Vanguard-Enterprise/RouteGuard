# Kiosk Driver UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the manual route-assignment-ID input on the driver pre-trip screen with an auto-fetched route card, add a logout button, and polish all driver screens to match the RouteGuard navy+amber brand.

**Architecture:** Add one new Go endpoint (`GET /api/v1/trips/assignment`) that previews the driver's active route without creating a trip. Update three frontend components (lock screen, route summary, pre-trip page) for branding and the new data flow. Fix the missing manifest save on trip start so stop data appears during active runs.

**Tech Stack:** Go 1.24 (chi router, pgx, tripauth middleware), Next.js 16 App Router, TypeScript, Tailwind v4, inline styles matching existing brand tokens.

---

## Task 1: Add `GET /api/v1/trips/assignment` handler

**Files:**
- Modify: `routeguard-api/internal/api/trip_device_handler.go`
- Modify: `routeguard-api/internal/server/server.go`
- Create: `routeguard-api/internal/api/trip_device_handler_test.go`

### Step 1: Write the failing test

Add to a new file `routeguard-api/internal/api/trip_device_handler_test.go`:

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// GetAssignment with no trip session context returns 401.
func TestGetAssignment_NoSession(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/trips/assignment", nil)
	w := httptest.NewRecorder()
	h.GetAssignment(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}
```

### Step 2: Run test to verify it fails

```bash
cd routeguard-api
go test -v -run TestGetAssignment_NoSession ./internal/api/
```

Expected: `FAIL` - `h.GetAssignment undefined`

### Step 3: Implement the handler

Add to `routeguard-api/internal/api/trip_device_handler.go` after the `EndTrip` function:

```go
// assignmentPreviewResponse is returned by GetAssignment.
type assignmentPreviewResponse struct {
	RouteName   string `json:"route_name"`
	RouteType   string `json:"route_type"`
	StopCount   int    `json:"stop_count"`
	VehicleName string `json:"vehicle_name"`
	Date        string `json:"date"`
}

// GetAssignment handles GET /api/v1/trips/assignment.
// Requires trip session auth. Returns the driver's active route assignment preview
// without creating a trip. Returns 404 if no active assignment exists.
func (h *Handler) GetAssignment(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	deviceRepo := repository.NewDeviceRepo(h.pool)
	device, err := deviceRepo.FindByIDAndCache(r.Context(), session.DeviceID, h.cache)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusUnauthorized, "unauthorized")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	if device.VehicleID == nil {
		Error(w, http.StatusNotFound, "device has no assigned vehicle")
		return
	}

	tripDeviceRepo := repository.NewTripDeviceRepo(h.pool)
	assignment, err := tripDeviceRepo.FindActiveAssignment(r.Context(), session.DriverID, *device.VehicleID, session.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "no active route assignment found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	routeRepo := repository.NewRouteRepo(h.pool)
	route, err := routeRepo.Get(r.Context(), assignment.RouteID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	stops, err := tripDeviceRepo.ListStopsWithStudents(r.Context(), assignment.RouteID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	vehicleRepo := repository.NewVehicleRepo(h.pool)
	vehicle, err := vehicleRepo.Get(r.Context(), *device.VehicleID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, assignmentPreviewResponse{
		RouteName:   route.Name,
		RouteType:   route.Type,
		StopCount:   len(stops),
		VehicleName: vehicle.Name,
		Date:        time.Now().Format("2006-01-02"),
	})
}
```

### Step 4: Wire the route

In `routeguard-api/internal/server/server.go`, add after the existing `tripSessionAuth` routes (around line 86):

```go
r.With(tripSessionAuth).Get("/api/v1/trips/assignment", h.GetAssignment)
```

### Step 5: Run test to verify it passes

```bash
cd routeguard-api
go test -v -run TestGetAssignment_NoSession ./internal/api/
```

Expected: `PASS`

### Step 6: Run all tests

```bash
cd routeguard-api
go test -v ./...
```

Expected: all pass

### Step 7: Commit

```bash
git add routeguard-api/internal/api/trip_device_handler.go \
        routeguard-api/internal/api/trip_device_handler_test.go \
        routeguard-api/internal/server/server.go
git commit -m "feat: add GET /api/v1/trips/assignment preview endpoint"
```

---

## Task 2: Fix manifest save on trip start

The pre-trip page calls `POST /api/v1/trips/start` and gets back a full `TripManifest` (with stops array), but never saves it to localStorage. The active run component reads `localStorage['trip_manifest']` and gets nothing.

**Files:**
- Modify: `dashboard/app/driver/pre-trip/page.tsx`

### Step 1: Update the `handleStartRun` function

In `dashboard/app/driver/pre-trip/page.tsx`, replace the block that handles a successful start response:

```typescript
// OLD - only saves trip_id, never saves manifest
const data = (await res.json()) as { trip_id: string }
const updatedSession: DriverSession = { ...session, trip_id: data.trip_id }
localStorage.setItem('driver_session', JSON.stringify(updatedSession))
router.push(`/driver/run/${data.trip_id}`)
```

Replace with:

```typescript
// NEW - save full manifest so active-run has stops
interface TripManifest {
  trip: { id: string }
  stops: Array<{ stop: { id: string; name: string; sequence_order: number }; students: unknown[] }>
}
const data = (await res.json()) as TripManifest
localStorage.setItem('trip_manifest', JSON.stringify(data.stops))
const updatedSession: DriverSession = { ...session, trip_id: data.trip.id }
localStorage.setItem('driver_session', JSON.stringify(updatedSession))
router.push(`/driver/run/${data.trip.id}`)
```

### Step 2: Verify build

```bash
cd dashboard
npm run build
```

Expected: exits 0 with no TypeScript errors

### Step 3: Commit

```bash
git add dashboard/app/driver/pre-trip/page.tsx
git commit -m "fix: save trip manifest to localStorage on trip start"
```

---

## Task 3: Rewrite `route-summary.tsx` - show real route data

The current component takes a manual text input for route assignment ID. Replace it with a read-only card showing fetched route data.

**Files:**
- Modify: `dashboard/components/driver/route-summary.tsx`

### Step 1: Rewrite the component

Replace the entire file content:

```typescript
'use client'

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface RouteSummaryProps {
  driverName: string
  preview: RoutePreview | null
  loading: boolean
  error: string | null
}

export default function RouteSummary({ driverName, preview, loading, error }: RouteSummaryProps) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      {/* Driver */}
      <div
        className="rounded-2xl px-6 py-4 flex flex-col gap-1"
        style={{ background: '#152D47', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-blue-300 text-xs uppercase tracking-widest">Driver</p>
        <p className="text-white text-2xl font-semibold">{driverName}</p>
        <p className="text-blue-400 text-sm">{today}</p>
      </div>

      {/* Route assignment */}
      <div
        className="rounded-2xl px-6 py-4 flex flex-col gap-3"
        style={{ background: '#152D47', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-blue-300 text-xs uppercase tracking-widest">Today's Assignment</p>

        {loading && (
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-blue-300 text-sm">Loading assignment...</span>
          </div>
        )}

        {!loading && error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        {!loading && !error && preview && (
          <div className="flex flex-col gap-2">
            <p style={{ color: '#F5A825' }} className="text-xl font-bold">
              {preview.route_name}
            </p>
            <div className="flex gap-4 text-sm text-blue-300">
              <span>{preview.vehicle_name}</span>
              <span>{preview.stop_count} stops</span>
              <span className="capitalize">{preview.route_type}</span>
            </div>
          </div>
        )}

        {!loading && !error && !preview && (
          <p className="text-blue-400 text-sm">No route assigned for today.</p>
        )}
      </div>
    </div>
  )
}
```

### Step 2: Verify build

```bash
cd dashboard
npm run build
```

Expected: TypeScript errors because `pre-trip/page.tsx` still passes old props. Fix those in Task 4.

---

## Task 4: Rewrite pre-trip page - fetch assignment, remove manual input, add logout

**Files:**
- Modify: `dashboard/app/driver/pre-trip/page.tsx`

### Step 1: Rewrite the page

Replace the entire file content:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RouteSummary from '@/components/driver/route-summary'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface DriverSession {
  driver_id: string
  driver_name: string
  org_id: string
  trip_id?: string | null
  session_token: string
}

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface TripManifest {
  trip: { id: string }
  stops: Array<{ stop: { id: string; name: string; sequence_order: number }; students: unknown[] }>
}

export default function PreTripPage() {
  const router = useRouter()
  const [session, setSession] = useState<DriverSession | null>(null)
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    let parsed: DriverSession
    try {
      parsed = JSON.parse(raw) as DriverSession
    } catch {
      router.replace('/driver')
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(parsed)

    // Fetch assignment preview
    fetch(`${API_BASE}/api/v1/trips/assignment`, {
      headers: { Authorization: `Bearer ${parsed.session_token}` },
    })
      .then(async (res) => {
        if (res.status === 404) {
          setPreview(null)
          return
        }
        if (!res.ok) throw new Error('Failed to load assignment')
        const data = await res.json() as RoutePreview
        setPreview(data)
      })
      .catch(() => setPreviewError('Could not load your assignment. Check your connection.'))
      .finally(() => setPreviewLoading(false))
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('driver_session')
    router.replace('/driver')
  }

  const handleStartRun = async () => {
    if (!session) return
    setStarting(true)
    setStartError(null)

    try {
      const res = await fetch(`${API_BASE}/api/v1/trips/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session_token}`,
        },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setStartError((body as { error?: string }).error ?? 'Failed to start trip. Please try again.')
        return
      }

      const data = (await res.json()) as TripManifest
      localStorage.setItem('trip_manifest', JSON.stringify(data.stops))
      const updatedSession: DriverSession = { ...session, trip_id: data.trip.id }
      localStorage.setItem('driver_session', JSON.stringify(updatedSession))
      router.push(`/driver/run/${data.trip.id}`)
    } catch {
      setStartError('Network error. Please check your connection.')
    } finally {
      setStarting(false)
    }
  }

  if (!session) return null

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col"
    >
      {/* Header with logout */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 style={{ color: '#F5A825' }} className="text-2xl font-bold tracking-tight">
          RouteGuard
        </h1>
        <button
          onClick={handleLogout}
          className="text-blue-300 text-sm px-4 py-2 rounded-lg border border-blue-700 hover:border-blue-500 transition-colors"
        >
          Log Out
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 pb-8">
        <div className="text-center">
          <h2 style={{ color: '#F5A825' }} className="text-3xl font-bold">
            Ready for your run?
          </h2>
          <p className="text-blue-300 mt-2">Review your assignment below</p>
        </div>

        <RouteSummary
          driverName={session.driver_name}
          preview={preview}
          loading={previewLoading}
          error={previewError}
        />

        {startError && (
          <p className="text-red-400 text-sm text-center">{startError}</p>
        )}

        <button
          onClick={handleStartRun}
          disabled={starting || previewLoading || (!preview && !previewError)}
          className="
            w-full max-w-sm py-4 rounded-xl text-xl font-bold text-white
            transition-all duration-150 active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          style={{ background: starting ? '#1e6b40' : '#2A7D4F' }}
        >
          {starting ? (
            <span className="flex items-center justify-center gap-3">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Starting...
            </span>
          ) : (
            'Start Run'
          )}
        </button>
      </div>
    </div>
  )
}
```

### Step 2: Verify build and lint

```bash
cd dashboard
npm run lint
npm run build
```

Expected: 0 errors, exits 0

### Step 3: Commit

```bash
git add dashboard/app/driver/pre-trip/page.tsx \
        dashboard/components/driver/route-summary.tsx
git commit -m "feat: pre-trip screen shows assigned route, adds logout button"
```

---

## Task 5: Polish lock screen branding

**Files:**
- Modify: `dashboard/components/driver/lock-screen.tsx`

### Step 1: Rewrite the component

Replace the entire file content:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinPad from './pin-pad'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function LockScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePinSubmit = async (pin: string) => {
    const deviceToken = localStorage.getItem('device_token')
    if (!deviceToken) return

    setLoading(true)
    setErrorMessage(null)
    setPinError(false)

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ pin }),
      })

      if (res.status === 401) {
        setPinError(true)
        setTimeout(() => setPinError(false), 1500)
        return
      }

      if (!res.ok) {
        setErrorMessage('Authentication failed. Please try again.')
        return
      }

      const data = await res.json()
      const session = {
        driver_id: data.driver_id,
        driver_name: data.driver_name,
        org_id: data.org_id,
        session_token: data.session_token,
      }
      localStorage.setItem('driver_session', JSON.stringify(session))
      router.push('/driver/pre-trip')
    } catch {
      setErrorMessage('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col items-center justify-center gap-10 px-4"
    >
      {/* Brand header */}
      <div className="text-center flex flex-col items-center gap-2">
        <h1 style={{ color: '#F5A825' }} className="text-5xl font-bold tracking-tight">
          RouteGuard
        </h1>
        <p className="text-blue-300 text-lg">{getGreeting()}</p>
      </div>

      {/* PIN card */}
      <div
        className="rounded-3xl px-8 py-8 flex flex-col items-center gap-6 w-full max-w-xs"
        style={{ background: '#152D47', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-blue-300 text-xs uppercase tracking-widest">Enter your PIN</p>
        <PinPad onSubmit={handlePinSubmit} loading={loading} error={pinError} />
        {errorMessage && (
          <p className="text-red-400 text-sm text-center">{errorMessage}</p>
        )}
      </div>

      {/* RFID hint */}
      <div className="flex flex-col items-center gap-2 opacity-50">
        <div className="w-12 h-px bg-blue-500" />
        <p className="text-blue-300 text-sm">or tap your RFID badge</p>
      </div>
    </div>
  )
}
```

### Step 2: Verify build and lint

```bash
cd dashboard
npm run lint
npm run build
```

Expected: 0 errors, exits 0

### Step 3: Commit

```bash
git add dashboard/components/driver/lock-screen.tsx
git commit -m "feat: polish lock screen branding - card layout, larger wordmark"
```

---

## Task 6: Final verification

### Step 1: Full lint + build

```bash
cd dashboard
npm run lint && npm run build
```

Expected: 0 lint errors, build exits 0 with no TypeScript errors

### Step 2: Go tests

```bash
cd routeguard-api
go test -v ./...
```

Expected: all pass

### Step 3: Commit (if any stray changes)

If `git status` shows uncommitted changes:

```bash
git add -p
git commit -m "fix: final kiosk driver UX cleanup"
```
