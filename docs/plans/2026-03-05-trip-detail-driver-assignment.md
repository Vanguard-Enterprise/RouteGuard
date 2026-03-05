# Trip Detail Driver Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let org admins open a trip detail page, see the assigned bus/route/driver, and assign (or change) the driver from a dropdown.

**Architecture:** Enrich the existing `TripRepo.Get` with JOINs to surface route_name, vehicle_number, driver_id, and driver_name. Add a `PATCH /dashboard/trips/{id}/assignment` endpoint that updates driver_id on the linked route_assignment. Add a client-side driver assignment widget to the existing trip detail page.

**Tech Stack:** Go 1.24 (chi, pgx), Next.js 16 App Router, React 19, Tailwind v4, React Hook Form not needed (single select)

---

### Task 1: Enrich domain.Trip with driver fields

**Files:**
- Modify: `routeguard-api/internal/domain/types.go` (Trip struct, ~line 343)

**Step 1: Add DriverID and DriverName to Trip**

Find the `Trip` struct and add two fields after `VehicleNumber`:

```go
type Trip struct {
	ID                string      `json:"id"`
	RouteAssignmentID string      `json:"route_assignment_id"`
	OrgID             string      `json:"org_id"`
	Date              pgtype.Date `json:"date"`
	Status            string      `json:"status"`
	StartedAt         *time.Time  `json:"started_at"`
	CompletedAt       *time.Time  `json:"completed_at"`
	Notes             *string     `json:"notes"`
	CreatedAt         time.Time   `json:"created_at"`
	// Enriched fields (populated by joined queries)
	RouteName     *string `json:"route_name,omitempty"`
	VehicleNumber *string `json:"vehicle_number,omitempty"`
	DriverID      *string `json:"driver_id,omitempty"`
	DriverName    *string `json:"driver_name,omitempty"`
}
```

**Step 2: Build to verify no compile errors**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git commit -m "feat: add driver_id and driver_name to Trip domain type"
```

---

### Task 2: Enrich TripRepo.Get with driver info

**Files:**
- Modify: `routeguard-api/internal/repository/trip_repo.go` (Get method, ~line 103)

**Step 1: Replace the Get method body**

The current `Get` uses `tripSelectCols` and `scanTrip` which only scan 9 fields. Replace it with a JOIN query matching the List method's pattern, but also joining users for driver name:

```go
func (r *TripRepo) Get(ctx context.Context, id, orgID string) (*domain.Trip, error) {
	var t domain.Trip
	err := r.pool.QueryRow(ctx, `
		SELECT
			t.id, t.route_assignment_id, t.org_id, t.date, t.status,
			t.started_at, t.completed_at, t.notes, t.created_at,
			r.name AS route_name, v.number AS vehicle_number,
			ra.driver_id, u.name AS driver_name
		FROM trips t
		LEFT JOIN route_assignments ra ON ra.id = t.route_assignment_id
		LEFT JOIN routes r ON r.id = ra.route_id
		LEFT JOIN vehicles v ON v.id = ra.vehicle_id
		LEFT JOIN users u ON u.id = ra.driver_id
		WHERE t.id = $1 AND t.org_id = $2
	`, id, orgID).Scan(
		&t.ID, &t.RouteAssignmentID, &t.OrgID, &t.Date, &t.Status,
		&t.StartedAt, &t.CompletedAt, &t.Notes, &t.CreatedAt,
		&t.RouteName, &t.VehicleNumber,
		&t.DriverID, &t.DriverName,
	)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
```

**Step 2: Build to verify**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/trip_repo.go
git commit -m "feat: enrich TripRepo.Get with route, vehicle, and driver info"
```

---

### Task 3: Add SetAssignmentDriver repo method

**Files:**
- Modify: `routeguard-api/internal/repository/trip_repo.go` (add method after Update)

**Step 1: Add the method**

```go
// SetAssignmentDriver updates the driver_id on the route_assignment linked to this trip.
// Scoped to orgID for safety. Returns the enriched trip after update.
func (r *TripRepo) SetAssignmentDriver(ctx context.Context, tripID, orgID string, driverID *string) (*domain.Trip, error) {
	_, err := r.pool.Exec(ctx, `
		UPDATE route_assignments ra
		SET driver_id = $1
		FROM trips t
		WHERE t.route_assignment_id = ra.id
		  AND t.id = $2
		  AND t.org_id = $3
	`, driverID, tripID, orgID)
	if err != nil {
		return nil, fmt.Errorf("set assignment driver: %w", err)
	}
	return r.Get(ctx, tripID, orgID)
}
```

**Step 2: Build**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/trip_repo.go
git commit -m "feat: add SetAssignmentDriver repo method"
```

---

### Task 4: Add PATCH /dashboard/trips/{id}/assignment handler

**Files:**
- Modify: `routeguard-api/internal/api/trip_handler.go` (add handler after UpdateMyTrip)
- Modify: `routeguard-api/internal/server/server.go` (wire route)

**Step 1: Add the handler to trip_handler.go**

Add after the existing `UpdateMyTrip` function:

```go
type updateTripAssignmentRequest struct {
	DriverID *string `json:"driver_id"`
}

// UpdateMyTripAssignment handles PATCH /dashboard/trips/{id}/assignment
// Sets the driver on the route_assignment linked to this trip.
func (h *Handler) UpdateMyTripAssignment(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	id := chi.URLParam(r, "id")

	var req updateTripAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewTripRepo(h.pool)
	trip, err := repo.SetAssignmentDriver(r.Context(), id, orgID, req.DriverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "trip not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, trip)
}
```

**Step 2: Wire the route in server.go**

Find the block with `/trips/auto-plan` and `/trips/{id}` routes. Add the new route before `r.With(...).Patch("/trips/{id}", ...)` (or wherever PATCH trips/{id} is registered):

```go
r.With(middleware.RequirePermission("trips:write")).Patch("/trips/{id}/assignment", h.UpdateMyTripAssignment)
```

This must go before `r.With(...).Get("/trips/{id}", ...)` to avoid chi route conflicts. The `/trips/{id}/assignment` static suffix prevents chi from treating "assignment" as the `{id}` value.

**Step 3: Build**

```bash
cd routeguard-api && go build ./cmd/api
```

Expected: no errors.

**Step 4: Commit**

```bash
git add routeguard-api/internal/api/trip_handler.go routeguard-api/internal/server/server.go
git commit -m "feat: add PATCH /dashboard/trips/{id}/assignment endpoint"
```

---

### Task 5: Update dashboard/lib/api.ts

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add driver fields to Trip interface**

Find the `Trip` interface and add `driver_id` and `driver_name`:

```ts
export interface Trip {
  id: string
  route_assignment_id: string
  org_id: string
  date: string
  status: string
  started_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  // Enriched fields
  route_name?: string
  vehicle_number?: string
  driver_id?: string | null
  driver_name?: string | null
}
```

**Step 2: Add updateAssignment to api.trips**

Find `api.trips` and add after the existing methods:

```ts
updateAssignment: (tripId: string, driverId: string | null) =>
  request<Trip>(`/dashboard/trips/${tripId}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({ driver_id: driverId }),
  }),
```

**Step 3: Lint**

```bash
cd dashboard && npm run lint
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add driver fields to Trip type and updateAssignment API method"
```

---

### Task 6: Add DriverAssignment client component

**Files:**
- Create: `dashboard/components/dashboard/driver-assignment.tsx`

**Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { api, Driver, Trip } from '@/lib/api'

interface DriverAssignmentProps {
  trip: Trip
  onUpdated: (trip: Trip) => void
}

export default function DriverAssignment({ trip, onUpdated }: DriverAssignmentProps) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.drivers.list().then(setDrivers).catch(() => {})
  }, [])

  async function handleChange(driverId: string) {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.trips.updateAssignment(trip.id, driverId || null)
      onUpdated(updated)
    } catch {
      setError('Failed to assign driver.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Driver</label>
      {error && <p className="text-xs text-red-500 mb-1">{error}</p>}
      <select
        value={trip.driver_id ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.first_name} {d.last_name}
          </option>
        ))}
      </select>
      {saving && <p className="text-xs text-gray-400 mt-1">Saving...</p>}
    </div>
  )
}
```

**Step 2: Lint**

```bash
cd dashboard && npm run lint
```

Expected: 0 errors.

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/driver-assignment.tsx
git commit -m "feat: add DriverAssignment client component"
```

---

### Task 7: Update trip detail page and TripDetailMap

**Files:**
- Modify: `dashboard/app/dashboard/trips/[id]/page.tsx`
- Modify: `dashboard/components/dashboard/trip-detail-map.tsx`

**Step 1: Update TripDetailMap to accept and show enriched fields**

The existing `TripDetailMap` shows a metadata grid with Status, Date, Started At, Completed At, Notes. Extend it to also show Route, Bus, and the `DriverAssignment` component.

Add `DriverAssignment` import at the top:
```tsx
import DriverAssignment from '@/components/dashboard/driver-assignment'
```

Add a `onTripUpdated` callback prop and `setTrip` state so the driver dropdown can refresh the displayed driver:

```tsx
'use client'

import { useState } from 'react'
import MapView from '@/components/map/map-view'
import type { Trip, Stop } from '@/lib/api'
import { useTripStream } from '@/hooks/use-trip-stream'
import DriverAssignment from '@/components/dashboard/driver-assignment'

export interface StopRow {
  id: string
  name: string
  scheduled_time: string | null
}

interface TripDetailMapProps {
  trip: Trip
  stops?: StopRow[]
  orgId: string
}
```

Inside the component, add local state for the trip and update the metadata grid to include Route, Bus, and Driver:

```tsx
export default function TripDetailMap({ trip: initialTrip, stops = [], orgId }: TripDetailMapProps) {
  const [trip, setTrip] = useState(initialTrip)
  const { locations, scans } = useTripStream(orgId)
  const busLocation = locations[trip.id]

  // ... existing scan counting logic ...

  const mapStops: Stop[] = []

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Trip Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="text-sm text-gray-900 mt-0.5"><StatusBadge status={trip.status} /></dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Date</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.date}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Route</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.route_name ?? '—'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Bus</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.vehicle_number ? `Bus ${trip.vehicle_number}` : '—'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Started At</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.started_at ? new Date(trip.started_at).toLocaleString() : '—'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Completed At</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.completed_at ? new Date(trip.completed_at).toLocaleString() : '—'}</dd>
          </div>
          {trip.notes && (
            <div className="flex flex-col col-span-2">
              <dt className="text-xs text-gray-500">Notes</dt>
              <dd className="text-sm text-gray-900 mt-0.5">{trip.notes}</dd>
            </div>
          )}
          <div className="flex flex-col col-span-2">
            <DriverAssignment trip={trip} onUpdated={setTrip} />
          </div>
        </dl>
      </div>

      {/* ... existing map and stops sections unchanged ... */}
    </div>
  )
}
```

**Step 2: Build the dashboard**

```bash
cd dashboard && npm run build
```

Expected: no TypeScript errors.

**Step 3: Lint**

```bash
cd dashboard && npm run lint
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add dashboard/components/dashboard/trip-detail-map.tsx dashboard/app/dashboard/trips/[id]/page.tsx
git commit -m "feat: show route/bus/driver on trip detail page with driver assignment dropdown"
```
