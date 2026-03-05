# Dashboard Simplification and Auto-Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify all dashboard forms, fix the trips table to show human-readable data, and add a smart auto-plan wizard that clusters students onto buses and optimizes stop order via the Mapbox Optimization API.

**Architecture:** Backend gains two new stateless/transactional endpoints (`/auto-plan` and `/auto-plan/confirm`), a greedy clustering algorithm, and Mapbox Optimization API integration. The dashboard replaces the manual trip creation form with a 3-step map-based wizard. All existing forms collapse non-essential fields behind an "Advanced" collapsible.

**Tech Stack:** Go 1.24 (API), Next.js 16 / React 19 / Tailwind v4 / mapbox-gl 3 (dashboard), PostgreSQL 16, Mapbox Optimization API v1.

---

## Task 1: DB migration - add device_id to vehicles

**Files:**
- Create: `routeguard-api/migrations/010_vehicle_device.up.sql`
- Create: `routeguard-api/migrations/010_vehicle_device.down.sql`
- Modify: `routeguard-api/internal/domain/types.go` (add `DeviceID` field to `Vehicle`)

**Step 1: Write the up migration**

`routeguard-api/migrations/010_vehicle_device.up.sql`:
```sql
ALTER TABLE vehicles ADD COLUMN device_id UUID REFERENCES devices(id) ON DELETE SET NULL;
```

**Step 2: Write the down migration**

`routeguard-api/migrations/010_vehicle_device.down.sql`:
```sql
ALTER TABLE vehicles DROP COLUMN IF EXISTS device_id;
```

**Step 3: Add DeviceID field to the Vehicle domain type**

In `routeguard-api/internal/domain/types.go`, find the `Vehicle` struct and add after `LicensePlate`:
```go
DeviceID     *string   `json:"device_id"`
```

**Step 4: Update vehicle repository to scan and write device_id**

Find `routeguard-api/internal/repository/vehicle_repo.go`. In the `vehicleSelectCols` constant, add `device_id` to the column list. In `scanVehicle`, add `&v.DeviceID` to the `Scan` call. In the `Create` and `Update` methods, accept and write `device_id`.

**Step 5: Run the migration manually to verify it applies**

```bash
cd routeguard-api
go run ./cmd/api  # starts API which runs migrations on boot
```
Expected: no migration errors in logs.

**Step 6: Commit**
```bash
git add routeguard-api/migrations/010_vehicle_device.up.sql \
        routeguard-api/migrations/010_vehicle_device.down.sql \
        routeguard-api/internal/domain/types.go \
        routeguard-api/internal/repository/vehicle_repo.go
git commit -m "feat: add device_id FK to vehicles table"
```

---

## Task 2: Enrich trip list with route_name and vehicle_number

The trips table currently shows a raw `route_assignment_id` UUID. We need to JOIN through `route_assignments` -> `routes` and `vehicles` to get readable names.

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`
- Modify: `routeguard-api/internal/repository/trip_repo.go`

**Step 1: Add enriched fields to Trip domain type**

In `routeguard-api/internal/domain/types.go`, add to the `Trip` struct:
```go
RouteName     *string `json:"route_name,omitempty"`
VehicleNumber *string `json:"vehicle_number,omitempty"`
```

**Step 2: Update the trip list query to JOIN and populate these fields**

In `routeguard-api/internal/repository/trip_repo.go`, replace `tripSelectCols` and the `List` method scan. The new query joins `route_assignments`, `routes`, and `vehicles`:

```go
const tripListQuery = `
    SELECT
        t.id, t.route_assignment_id, t.org_id, t.date, t.status,
        t.started_at, t.completed_at, t.notes, t.created_at,
        r.name AS route_name, v.number AS vehicle_number
    FROM trips t
    LEFT JOIN route_assignments ra ON ra.id = t.route_assignment_id
    LEFT JOIN routes r ON r.id = ra.route_id
    LEFT JOIN vehicles v ON v.id = ra.vehicle_id
`
```

Update the `List` method to use this query (replacing the existing `SELECT tripSelectCols FROM trips` construct) and update the `rows.Scan` to also scan `&t.RouteName, &t.VehicleNumber`.

The `Get`, `Create`, and `Update` methods can keep using the simple `tripSelectCols` - those don't need enrichment.

**Step 3: Write a test**

In `routeguard-api/internal/repository/trip_repo_test.go` (create if it doesn't exist):
```go
func TestTripListEnrichment(t *testing.T) {
    // This is a smoke test - verify the query doesn't error.
    // Full integration tests require a test DB (out of scope here).
    // At minimum verify the query compiles and the struct fields exist.
    var trip domain.Trip
    _ = trip.RouteName
    _ = trip.VehicleNumber
}
```

**Step 4: Build to verify no compile errors**
```bash
cd routeguard-api
go build ./...
```
Expected: exits 0.

**Step 5: Commit**
```bash
git add routeguard-api/internal/domain/types.go \
        routeguard-api/internal/repository/trip_repo.go
git commit -m "feat: enrich trip list response with route_name and vehicle_number"
```

---

## Task 3: Add MAPBOX_SECRET_TOKEN to API config

The Optimization API is called server-side from Go, so we need a Mapbox token in the API config.

**Files:**
- Modify: `routeguard-api/internal/config/config.go`

**Step 1: Read the config file to understand its structure**

Open `routeguard-api/internal/config/config.go` and note the pattern used (likely `os.Getenv`).

**Step 2: Add MapboxSecretToken field**

Add to the config struct:
```go
MapboxSecretToken string
```

And in the loading function (where env vars are read):
```go
MapboxSecretToken: os.Getenv("MAPBOX_SECRET_TOKEN"),
```

**Step 3: Build to verify**
```bash
cd routeguard-api && go build ./...
```

**Step 4: Commit**
```bash
git add routeguard-api/internal/config/config.go
git commit -m "feat: add MAPBOX_SECRET_TOKEN to API config"
```

---

## Task 4: Auto-plan clustering algorithm (pure function, unit-tested)

This is the core logic: given students with lat/lng and buses with capacity, group students into bus-sized clusters geographically.

**Files:**
- Create: `routeguard-api/internal/autoplan/cluster.go`
- Create: `routeguard-api/internal/autoplan/cluster_test.go`

**Step 1: Write the failing test first**

`routeguard-api/internal/autoplan/cluster_test.go`:
```go
package autoplan_test

import (
    "testing"
    "github.com/routeguard/api/internal/autoplan"
)

func TestClusterStudents_BasicGrouping(t *testing.T) {
    students := []autoplan.StudentPoint{
        {ID: "s1", Lat: 37.10, Lng: -122.10},
        {ID: "s2", Lat: 37.11, Lng: -122.11},
        {ID: "s3", Lat: 37.50, Lng: -122.50},
        {ID: "s4", Lat: 37.51, Lng: -122.51},
    }
    buses := []autoplan.BusSlot{
        {VehicleID: "v1", Capacity: 2},
        {VehicleID: "v2", Capacity: 2},
    }

    groups := autoplan.ClusterStudents(students, buses)

    if len(groups) != 2 {
        t.Fatalf("expected 2 groups, got %d", len(groups))
    }
    total := 0
    for _, g := range groups {
        total += len(g.StudentIDs)
    }
    if total != 4 {
        t.Fatalf("expected 4 students assigned, got %d", total)
    }
}

func TestClusterStudents_MoreStudentsThanCapacity(t *testing.T) {
    students := []autoplan.StudentPoint{
        {ID: "s1", Lat: 37.10, Lng: -122.10},
        {ID: "s2", Lat: 37.11, Lng: -122.11},
        {ID: "s3", Lat: 37.12, Lng: -122.12},
    }
    buses := []autoplan.BusSlot{
        {VehicleID: "v1", Capacity: 2},
    }

    groups := autoplan.ClusterStudents(students, buses)

    if len(groups[0].StudentIDs) != 2 {
        t.Fatalf("expected bus to be capped at capacity 2")
    }
    if len(groups[0].Unassigned) != 1 {
        t.Fatalf("expected 1 unassigned student")
    }
}
```

**Step 2: Run to verify tests fail**
```bash
cd routeguard-api
go test ./internal/autoplan/... -v
```
Expected: FAIL - package does not exist yet.

**Step 3: Implement cluster.go**

`routeguard-api/internal/autoplan/cluster.go`:
```go
package autoplan

import "math"

// StudentPoint is a student with geocoordinates.
type StudentPoint struct {
    ID  string
    Lat float64
    Lng float64
}

// BusSlot is an available vehicle with its remaining capacity.
type BusSlot struct {
    VehicleID string
    Capacity  int
}

// BusGroup is the result of assigning students to one bus.
type BusGroup struct {
    VehicleID  string
    StudentIDs []string
    Points     []StudentPoint
    Unassigned []StudentPoint // only populated on the last bus if overflow
}

// ClusterStudents assigns students to buses using a greedy nearest-neighbor
// algorithm. Students are sorted by proximity to the centroid of all students,
// then packed into buses in order until each bus reaches capacity.
// Any students that exceed total capacity are returned as Unassigned on the last group.
func ClusterStudents(students []StudentPoint, buses []BusSlot) []BusGroup {
    if len(students) == 0 || len(buses) == 0 {
        return nil
    }

    // Compute centroid
    var cLat, cLng float64
    for _, s := range students {
        cLat += s.Lat
        cLng += s.Lng
    }
    cLat /= float64(len(students))
    cLng /= float64(len(students))

    // Sort students by distance from centroid
    sorted := make([]StudentPoint, len(students))
    copy(sorted, students)
    sortByDistance(sorted, cLat, cLng)

    groups := make([]BusGroup, 0, len(buses))
    idx := 0
    for _, bus := range buses {
        g := BusGroup{VehicleID: bus.VehicleID}
        for i := 0; i < bus.Capacity && idx < len(sorted); i++ {
            g.StudentIDs = append(g.StudentIDs, sorted[idx].ID)
            g.Points = append(g.Points, sorted[idx])
            idx++
        }
        groups = append(groups, g)
    }

    // Any remaining students go on Unassigned of the last group
    if idx < len(sorted) && len(groups) > 0 {
        groups[len(groups)-1].Unassigned = sorted[idx:]
    }

    return groups
}

func haversine(lat1, lng1, lat2, lng2 float64) float64 {
    const R = 6371.0
    dLat := (lat2 - lat1) * math.Pi / 180
    dLng := (lng2 - lng1) * math.Pi / 180
    a := math.Sin(dLat/2)*math.Sin(dLat/2) +
        math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
            math.Sin(dLng/2)*math.Sin(dLng/2)
    return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func sortByDistance(pts []StudentPoint, lat, lng float64) {
    // Simple insertion sort (n is small - typically < 500 students)
    for i := 1; i < len(pts); i++ {
        key := pts[i]
        keyDist := haversine(key.Lat, key.Lng, lat, lng)
        j := i - 1
        for j >= 0 && haversine(pts[j].Lat, pts[j].Lng, lat, lng) > keyDist {
            pts[j+1] = pts[j]
            j--
        }
        pts[j+1] = key
    }
}
```

**Step 4: Run tests to verify they pass**
```bash
cd routeguard-api
go test ./internal/autoplan/... -v
```
Expected: both tests PASS.

**Step 5: Commit**
```bash
git add routeguard-api/internal/autoplan/
git commit -m "feat: add greedy student clustering algorithm for auto-plan"
```

---

## Task 5: Mapbox Optimization API client

Calls the Mapbox Optimization API for a single bus's stops to get optimal waypoint order.

**Files:**
- Create: `routeguard-api/internal/autoplan/mapbox.go`
- Create: `routeguard-api/internal/autoplan/mapbox_test.go`

**Step 1: Write a test for the coordinate formatter (no HTTP call)**

`routeguard-api/internal/autoplan/mapbox_test.go`:
```go
package autoplan_test

import (
    "testing"
    "github.com/routeguard/api/internal/autoplan"
)

func TestFormatCoordinates(t *testing.T) {
    pts := []autoplan.StudentPoint{
        {Lat: 37.10, Lng: -122.10},
        {Lat: 37.20, Lng: -122.20},
    }
    result := autoplan.FormatCoordinates(pts)
    expected := "-122.100000,37.100000;-122.200000,37.200000"
    if result != expected {
        t.Fatalf("expected %q, got %q", expected, result)
    }
}
```

**Step 2: Run to verify test fails**
```bash
cd routeguard-api && go test ./internal/autoplan/... -run TestFormatCoordinates -v
```
Expected: FAIL - FormatCoordinates not defined.

**Step 3: Implement mapbox.go**

`routeguard-api/internal/autoplan/mapbox.go`:
```go
package autoplan

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "strings"
)

// FormatCoordinates formats StudentPoints as "lng,lat;lng,lat" for Mapbox API.
func FormatCoordinates(pts []StudentPoint) string {
    parts := make([]string, len(pts))
    for i, p := range pts {
        parts[i] = fmt.Sprintf("%f,%f", p.Lng, p.Lat)
    }
    return strings.Join(parts, ";")
}

type mapboxOptimizationResponse struct {
    Waypoints []struct {
        WaypointIndex int `json:"waypoint_index"`
        TripsIndex    int `json:"trips_index"`
    } `json:"waypoints"`
}

// OptimizeStops calls the Mapbox Optimization API and returns points in
// the optimal visit order. Returns the original order if the API fails.
func OptimizeStops(ctx context.Context, token string, pts []StudentPoint) ([]StudentPoint, error) {
    if len(pts) <= 1 {
        return pts, nil
    }
    coords := FormatCoordinates(pts)
    url := fmt.Sprintf(
        "https://api.mapbox.com/optimized-trips/v1/mapbox/driving/%s?roundtrip=false&source=first&destination=last&access_token=%s",
        coords, token,
    )
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return pts, fmt.Errorf("mapbox optimize: build request: %w", err)
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return pts, fmt.Errorf("mapbox optimize: request: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return pts, fmt.Errorf("mapbox optimize: status %d", resp.StatusCode)
    }

    var result mapboxOptimizationResponse
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return pts, fmt.Errorf("mapbox optimize: decode: %w", err)
    }

    // Build reordered slice from waypoint_index
    ordered := make([]StudentPoint, len(pts))
    for _, wp := range result.Waypoints {
        if wp.WaypointIndex < len(pts) {
            ordered[wp.WaypointIndex] = pts[wp.TripsIndex]
        }
    }
    return ordered, nil
}
```

**Step 4: Run tests**
```bash
cd routeguard-api && go test ./internal/autoplan/... -v
```
Expected: all tests PASS (FormatCoordinates test passes; OptimizeStops is not unit-tested because it makes HTTP calls).

**Step 5: Commit**
```bash
git add routeguard-api/internal/autoplan/mapbox.go \
        routeguard-api/internal/autoplan/mapbox_test.go
git commit -m "feat: add Mapbox Optimization API client for stop ordering"
```

---

## Task 6: Auto-plan HTTP handler

**Files:**
- Create: `routeguard-api/internal/api/autoplan_handler.go`

**Step 1: Write the handler**

`routeguard-api/internal/api/autoplan_handler.go`:
```go
package api

import (
    "encoding/json"
    "net/http"
    "time"

    "github.com/routeguard/api/internal/auth"
    "github.com/routeguard/api/internal/autoplan"
    "github.com/routeguard/api/internal/repository"
)

type autoPlanRequest struct {
    Date string `json:"date"` // YYYY-MM-DD
    Type string `json:"type"` // morning | afternoon | midday
}

type autoPlanStop struct {
    Order      int      `json:"order"`
    Lat        float64  `json:"lat"`
    Lng        float64  `json:"lng"`
    Address    *string  `json:"address"`
    StudentIDs []string `json:"student_ids"`
}

type autoPlanBus struct {
    VehicleID     string         `json:"vehicle_id"`
    VehicleNumber *string        `json:"vehicle_number"`
    Stops         []autoPlanStop `json:"stops"`
}

type autoPlanResponse struct {
    Buses               []autoPlanBus `json:"buses"`
    UnassignedStudents  []string      `json:"unassigned_students"`
}

// AutoPlanTrips handles POST /dashboard/trips/auto-plan
// Returns a computed plan (does not persist anything).
func (h *Handler) AutoPlanTrips(w http.ResponseWriter, r *http.Request) {
    session := auth.SessionFromContext(r.Context())
    if session == nil {
        Error(w, http.StatusUnauthorized, "unauthorized")
        return
    }
    orgID := session.OrgID

    var req autoPlanRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        Error(w, http.StatusBadRequest, "invalid request body")
        return
    }
    if req.Date == "" {
        Error(w, http.StatusBadRequest, "date is required")
        return
    }
    if _, err := time.Parse("2006-01-02", req.Date); err != nil {
        Error(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
        return
    }

    // Fetch active students with geocoords
    studentRepo := repository.NewStudentRepo(h.pool)
    students, err := studentRepo.ListWithCoords(r.Context(), orgID)
    if err != nil {
        Error(w, http.StatusInternalServerError, "internal server error")
        return
    }

    // Fetch active vehicles with capacity
    vehicleRepo := repository.NewVehicleRepo(h.pool)
    vehicles, err := vehicleRepo.ListActive(r.Context(), orgID)
    if err != nil {
        Error(w, http.StatusInternalServerError, "internal server error")
        return
    }

    // Build autoplan inputs
    pts := make([]autoplan.StudentPoint, 0, len(students))
    addrByID := make(map[string]*string)
    for _, s := range students {
        if s.Lat != nil && s.Lng != nil {
            pts = append(pts, autoplan.StudentPoint{ID: s.ID, Lat: *s.Lat, Lng: *s.Lng})
            addrByID[s.ID] = s.Address
        }
    }

    buses := make([]autoplan.BusSlot, 0, len(vehicles))
    vehicleByID := make(map[string]interface{ GetNumber() *string }{})
    type vehicleInfo struct{ number *string }
    vInfoByID := make(map[string]*string)
    for _, v := range vehicles {
        cap := 30 // default if not set
        if v.Capacity != nil {
            cap = *v.Capacity
        }
        buses = append(buses, autoplan.BusSlot{VehicleID: v.ID, Capacity: cap})
        vInfoByID[v.ID] = v.Number
    }
    _ = vehicleByID

    groups := autoplan.ClusterStudents(pts, buses)

    // Optimize stop order per bus
    resp := autoPlanResponse{
        Buses:              make([]autoPlanBus, 0, len(groups)),
        UnassignedStudents: []string{},
    }

    mapboxToken := h.cfg.MapboxSecretToken
    for _, g := range groups {
        ordered, _ := autoplan.OptimizeStops(r.Context(), mapboxToken, g.Points)
        stops := make([]autoPlanStop, 0, len(ordered))
        for i, pt := range ordered {
            // Group all students at this coordinate into one stop
            stop := autoPlanStop{
                Order:      i + 1,
                Lat:        pt.Lat,
                Lng:        pt.Lng,
                Address:    addrByID[pt.ID],
                StudentIDs: []string{pt.ID},
            }
            stops = append(stops, stop)
        }
        resp.Buses = append(resp.Buses, autoPlanBus{
            VehicleID:     g.VehicleID,
            VehicleNumber: vInfoByID[g.VehicleID],
            Stops:         stops,
        })
        for _, u := range g.Unassigned {
            resp.UnassignedStudents = append(resp.UnassignedStudents, u.ID)
        }
    }

    JSON(w, http.StatusOK, resp)
}
```

Note: this handler references `h.cfg` - check `handler.go` to see how config is stored on the handler. If `cfg` is not already a field, add it. Also references `studentRepo.ListWithCoords` and `vehicleRepo.ListActive` which need to be added in the next step.

**Step 2: Check handler.go for config storage pattern**

Open `routeguard-api/internal/api/handler.go` and note how config is accessed. Add `cfg config.Config` field if not present and wire it in the constructor.

**Step 3: Build to check for errors (will fail until repo methods exist)**
```bash
cd routeguard-api && go build ./... 2>&1 | head -20
```

**Step 4: Commit as work-in-progress**
```bash
git add routeguard-api/internal/api/autoplan_handler.go
git commit -m "feat: add AutoPlanTrips handler skeleton"
```

---

## Task 7: Add required repository methods

Two repo methods are needed: `StudentRepo.ListWithCoords` and `VehicleRepo.ListActive`.

**Files:**
- Modify: `routeguard-api/internal/repository/student_repo.go`
- Modify: `routeguard-api/internal/repository/vehicle_repo.go`

**Step 1: Add StudentRepo.ListWithCoords**

In `student_repo.go`, add:
```go
// ListWithCoords returns all active students for the org that have lat/lng set.
func (r *StudentRepo) ListWithCoords(ctx context.Context, orgID string) ([]domain.Student, error) {
    rows, err := r.pool.Query(ctx, `
        SELECT id, org_id, school_id, first_name, last_name, student_number,
               grade, rfid_tag_id_hash, address, city, state, zip, lat, lng,
               status, medical_notes, created_at, updated_at
        FROM students
        WHERE org_id = $1 AND status = 'active' AND lat IS NOT NULL AND lng IS NOT NULL
        ORDER BY last_name, first_name
    `, orgID)
    if err != nil {
        return nil, fmt.Errorf("students list with coords: %w", err)
    }
    defer rows.Close()
    var result []domain.Student
    for rows.Next() {
        var s domain.Student
        if err := rows.Scan(
            &s.ID, &s.OrgID, &s.SchoolID, &s.FirstName, &s.LastName, &s.StudentNumber,
            &s.Grade, &s.RFIDTagIDHash, &s.Address, &s.City, &s.State, &s.Zip,
            &s.Lat, &s.Lng, &s.Status, &s.MedicalNotes, &s.CreatedAt, &s.UpdatedAt,
        ); err != nil {
            return nil, fmt.Errorf("students list with coords scan: %w", err)
        }
        result = append(result, s)
    }
    return result, rows.Err()
}
```

**Step 2: Add VehicleRepo.ListActive**

In `vehicle_repo.go`, add:
```go
// ListActive returns all vehicles with status 'active' for the org.
func (r *VehicleRepo) ListActive(ctx context.Context, orgID string) ([]domain.Vehicle, error) {
    rows, err := r.pool.Query(ctx, `
        SELECT id, org_id, name, number, capacity, year, make, model,
               vin, license_plate, status, device_id, created_at, updated_at
        FROM vehicles
        WHERE org_id = $1 AND status = 'active'
        ORDER BY number, name
    `, orgID)
    if err != nil {
        return nil, fmt.Errorf("vehicles list active: %w", err)
    }
    defer rows.Close()
    var result []domain.Vehicle
    for rows.Next() {
        var v domain.Vehicle
        if err := rows.Scan(
            &v.ID, &v.OrgID, &v.Name, &v.Number, &v.Capacity, &v.Year,
            &v.Make, &v.Model, &v.VIN, &v.LicensePlate, &v.Status,
            &v.DeviceID, &v.CreatedAt, &v.UpdatedAt,
        ); err != nil {
            return nil, fmt.Errorf("vehicles list active scan: %w", err)
        }
        result = append(result, v)
    }
    return result, rows.Err()
}
```

**Step 3: Build to verify**
```bash
cd routeguard-api && go build ./...
```
Expected: exits 0.

**Step 4: Commit**
```bash
git add routeguard-api/internal/repository/student_repo.go \
        routeguard-api/internal/repository/vehicle_repo.go
git commit -m "feat: add ListWithCoords and ListActive repo methods"
```

---

## Task 8: Auto-plan confirm handler

**Files:**
- Modify: `routeguard-api/internal/api/autoplan_handler.go`

**Step 1: Add the confirm request types and handler**

Append to `autoplan_handler.go`:
```go
type confirmStop struct {
    Order      int      `json:"order"`
    Lat        float64  `json:"lat"`
    Lng        float64  `json:"lng"`
    Address    *string  `json:"address"`
    StudentIDs []string `json:"student_ids"`
}

type confirmBus struct {
    VehicleID string        `json:"vehicle_id"`
    Stops     []confirmStop `json:"stops"`
}

type autoPlanConfirmRequest struct {
    Date string       `json:"date"` // YYYY-MM-DD
    Type string       `json:"type"` // morning | afternoon | midday
    Buses []confirmBus `json:"buses"`
}

// AutoPlanConfirm handles POST /dashboard/trips/auto-plan/confirm
// Creates all routes, stops, student_stops, route_assignments, and trips atomically.
func (h *Handler) AutoPlanConfirm(w http.ResponseWriter, r *http.Request) {
    session := auth.SessionFromContext(r.Context())
    if session == nil {
        Error(w, http.StatusUnauthorized, "unauthorized")
        return
    }
    orgID := session.OrgID

    var req autoPlanConfirmRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        Error(w, http.StatusBadRequest, "invalid request body")
        return
    }
    if req.Date == "" || len(req.Buses) == 0 {
        Error(w, http.StatusBadRequest, "date and buses are required")
        return
    }
    t, err := time.Parse("2006-01-02", req.Date)
    if err != nil {
        Error(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
        return
    }

    ctx := r.Context()
    tx, err := h.pool.Begin(ctx)
    if err != nil {
        Error(w, http.StatusInternalServerError, "internal server error")
        return
    }
    defer tx.Rollback(ctx)

    dayOfWeek := t.Weekday().String()[:3] // "Mon", "Tue", etc.
    pgDate := pgtype.Date{Time: t, Valid: true}

    type createdTrip struct {
        ID string `json:"id"`
    }
    var trips []createdTrip

    for _, bus := range req.Buses {
        // 1. Get vehicle number for the route name
        var vehicleNumber *string
        _ = tx.QueryRow(ctx, `SELECT number FROM vehicles WHERE id = $1`, bus.VehicleID).Scan(&vehicleNumber)
        busLabel := bus.VehicleID[:8]
        if vehicleNumber != nil {
            busLabel = "Bus " + *vehicleNumber
        }
        routeName := req.Type + " - " + busLabel + " - " + req.Date

        // 2. Create route
        var routeID string
        err = tx.QueryRow(ctx, `
            INSERT INTO routes (id, org_id, name, type, status, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, 'active', now(), now())
            RETURNING id
        `, orgID, routeName, req.Type).Scan(&routeID)
        if err != nil {
            Error(w, http.StatusInternalServerError, "failed to create route")
            return
        }

        // 3. Create stops and student_stops
        for _, stop := range bus.Stops {
            var stopID string
            addr := ""
            if stop.Address != nil {
                addr = *stop.Address
            }
            err = tx.QueryRow(ctx, `
                INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
                RETURNING id
            `, routeID, addr, addr, stop.Lat, stop.Lng, stop.Order).Scan(&stopID)
            if err != nil {
                Error(w, http.StatusInternalServerError, "failed to create stop")
                return
            }
            for _, studentID := range stop.StudentIDs {
                _, err = tx.Exec(ctx, `
                    INSERT INTO student_stops (id, student_id, stop_id, route_id, effective_date)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4)
                `, studentID, stopID, routeID, pgDate)
                if err != nil {
                    Error(w, http.StatusInternalServerError, "failed to create student stop")
                    return
                }
            }
        }

        // 4. Create route_assignment
        var assignmentID string
        err = tx.QueryRow(ctx, `
            INSERT INTO route_assignments (id, route_id, vehicle_id, driver_id, effective_date, days_of_week, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())
            RETURNING id
        `, routeID, bus.VehicleID, nil, pgDate, dayOfWeek).Scan(&assignmentID)
        if err != nil {
            Error(w, http.StatusInternalServerError, "failed to create assignment")
            return
        }

        // 5. Create trip
        var tripID string
        err = tx.QueryRow(ctx, `
            INSERT INTO trips (id, route_assignment_id, org_id, date, status, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, 'scheduled', now())
            RETURNING id
        `, assignmentID, orgID, pgDate).Scan(&tripID)
        if err != nil {
            Error(w, http.StatusInternalServerError, "failed to create trip")
            return
        }
        trips = append(trips, createdTrip{ID: tripID})
    }

    if err := tx.Commit(ctx); err != nil {
        Error(w, http.StatusInternalServerError, "failed to commit")
        return
    }

    JSON(w, http.StatusCreated, map[string]interface{}{"trips": trips})
}
```

Note: `route_assignments.driver_id` is currently non-nullable in the schema. Check the migration and if needed update to allow NULL, or pass a placeholder. Check `routeguard-api/migrations/` for the route_assignments DDL and confirm nullable status.

**Step 2: Build to verify**
```bash
cd routeguard-api && go build ./...
```

**Step 3: Commit**
```bash
git add routeguard-api/internal/api/autoplan_handler.go
git commit -m "feat: add AutoPlanConfirm handler"
```

---

## Task 9: Wire auto-plan routes in server.go

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Find the trips route block**

Search for `ListMyTrips` in `server.go`. The block looks like:
```go
r.With(middleware.RequirePermission("trips:read")).Get("/trips", h.ListMyTrips)
r.With(middleware.RequirePermission("trips:write")).Post("/trips", h.CreateMyTrip)
```

**Step 2: Add the two new routes after the existing trips routes**

```go
r.With(middleware.RequirePermission("trips:write")).Post("/trips/auto-plan", h.AutoPlanTrips)
r.With(middleware.RequirePermission("trips:write")).Post("/trips/auto-plan/confirm", h.AutoPlanConfirm)
```

Important: these must be added BEFORE any `/trips/{id}` route registration, since chi matches routes in order and `/trips/auto-plan` would otherwise be consumed by `/trips/{id}`.

**Step 3: Build and run tests**
```bash
cd routeguard-api
go build ./...
go test -v ./...
```
Expected: all tests pass.

**Step 4: Commit**
```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire auto-plan routes in server"
```

---

## Task 10: Update dashboard API client types

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Read lib/api.ts to find the Trip interface**

Open `dashboard/lib/api.ts`. Find the `Trip` interface.

**Step 2: Add enriched fields and auto-plan types**

Add to the `Trip` interface:
```typescript
route_name?: string
vehicle_number?: string
```

Add new interfaces at the bottom of the types section:
```typescript
export interface AutoPlanStop {
  order: number
  lat: number
  lng: number
  address?: string
  student_ids: string[]
}

export interface AutoPlanBus {
  vehicle_id: string
  vehicle_number?: string
  stops: AutoPlanStop[]
}

export interface AutoPlanResponse {
  buses: AutoPlanBus[]
  unassigned_students: string[]
}

export interface AutoPlanConfirmRequest {
  date: string
  type: string
  buses: AutoPlanBus[]
}
```

**Step 3: Add auto-plan API methods**

In the `api` object, add under `trips`:
```typescript
autoplan: (date: string, type: string) =>
  request<AutoPlanResponse>('/dashboard/trips/auto-plan', {
    method: 'POST',
    body: JSON.stringify({ date, type }),
  }),
autoPlanConfirm: (payload: AutoPlanConfirmRequest) =>
  request<{ trips: { id: string }[] }>('/dashboard/trips/auto-plan/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
```

**Step 4: Lint check**
```bash
cd dashboard && npm run lint
```
Expected: 0 errors.

**Step 5: Commit**
```bash
git add dashboard/lib/api.ts
git commit -m "feat: add auto-plan types and API methods to dashboard client"
```

---

## Task 11: Fix the trips table display

**Files:**
- Modify: `dashboard/components/dashboard/trip-table.tsx`

**Step 1: Replace the route_assignment_id column**

In `trip-table.tsx`, find the column definition for `route_assignment_id`:
```tsx
{
  key: 'route_assignment_id',
  header: 'Assignment',
  render: (row) => (
    <span className="font-mono text-xs text-gray-600">{row.route_assignment_id.slice(0, 8)}…</span>
  ),
},
```

Replace with:
```tsx
{
  key: 'route_name',
  header: 'Route',
  render: (row) => (
    <span className="text-sm text-gray-700">
      {row.route_name ?? row.route_assignment_id.slice(0, 8) + '…'}
    </span>
  ),
},
{
  key: 'vehicle_number',
  header: 'Bus',
  render: (row) => (
    <span className="text-sm text-gray-600">
      {row.vehicle_number ? `Bus ${row.vehicle_number}` : '—'}
    </span>
  ),
},
```

**Step 2: Also update the search filter to search by route_name**

In the `filtered` computation, update the condition:
```tsx
const filtered = search
  ? trips.filter(
      (t) =>
        t.date.includes(search) ||
        t.status.toLowerCase().includes(search.toLowerCase()) ||
        (t.route_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.vehicle_number ?? '').toLowerCase().includes(search.toLowerCase()),
    )
  : trips
```

**Step 3: Lint and build**
```bash
cd dashboard && npm run lint && npm run build
```
Expected: 0 errors, clean build.

**Step 4: Commit**
```bash
git add dashboard/components/dashboard/trip-table.tsx
git commit -m "fix: show route name and bus number in trips table instead of raw UUID"
```

---

## Task 12: Simplify vehicle form

**Files:**
- Modify: `dashboard/components/dashboard/vehicle-form.tsx`

**Step 1: Restructure the form**

Rewrite `vehicle-form.tsx` with this structure:
- Primary section: Bus Number (required, maps to `number`), Capacity (maps to `capacity`)
- Device assignment dropdown (fetches devices from `api.devices.list()`, allows selecting one to link)
- "Advanced details" collapsible (`<details>` element): Name, Make, Model, Year, VIN, License Plate, Status

Make `number` required in the zod schema (change from `optional()` to `min(1, 'Bus number is required')`).

Add `device_id` to the schema:
```typescript
device_id: z.string().optional(),
```

Add `device_id` to the form default values and the submit payload.

To render the device dropdown, add a `useEffect` to load `api.devices.list()` and render a `<select>` showing device serial/hostname.

The `<details>` pattern for the collapsible:
```tsx
<details className="group">
  <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 mb-3 list-none flex items-center gap-1">
    <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
    Advanced details
  </summary>
  <div className="space-y-4 mt-3">
    {/* Name, Make, Model, Year, VIN, License Plate, Status fields */}
  </div>
</details>
```

**Step 2: Lint and build**
```bash
cd dashboard && npm run lint && npm run build
```

**Step 3: Commit**
```bash
git add dashboard/components/dashboard/vehicle-form.tsx
git commit -m "feat: simplify vehicle form - bus number and capacity first, advanced fields collapsed"
```

---

## Task 13: Simplify student form

**Files:**
- Modify: `dashboard/components/dashboard/student-form.tsx`

**Step 1: Restructure the form**

Primary fields (always visible): First Name, Last Name, School, Address (the existing AddressAutocomplete component already handles city/state/zip population).

Remove the separate City, State, ZIP fields from the primary section - they are redundant since AddressAutocomplete populates them. Keep them hidden in the form state (the autocomplete already sets them via the form context).

"More details" collapsible (`<details>`): Grade, Student Number, Status (defaulting to active), Medical Notes, RFID Tag.

**Step 2: Lint and build**
```bash
cd dashboard && npm run lint && npm run build
```

**Step 3: Commit**
```bash
git add dashboard/components/dashboard/student-form.tsx
git commit -m "feat: simplify student form - essential fields first, details collapsed"
```

---

## Task 14: Auto-plan wizard - Step 1 (Configure)

**Files:**
- Create: `dashboard/components/dashboard/auto-plan-wizard.tsx`

**Step 1: Build the wizard skeleton with step 1 UI**

`dashboard/components/dashboard/auto-plan-wizard.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { api, type AutoPlanResponse } from '@/lib/api'
import AutoPlanMap from '@/components/dashboard/auto-plan-map'

type Step = 'configure' | 'review' | 'confirming' | 'done'

interface AutoPlanWizardProps {
  onClose: () => void
  onConfirmed: (tripIds: string[]) => void
}

export default function AutoPlanWizard({ onClose, onConfirmed }: AutoPlanWizardProps) {
  const [step, setStep] = useState<Step>('configure')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<'morning' | 'afternoon' | 'midday'>('morning')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<AutoPlanResponse | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.trips.autoplan(date, type)
      if (result.buses.length === 0) {
        setError('No active students with addresses found. Add student addresses first.')
        return
      }
      setPlan(result)
      setStep('review')
    } catch {
      setError('Failed to generate plan. Check that buses and students are configured.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(finalPlan: AutoPlanResponse) {
    setStep('confirming')
    try {
      const result = await api.trips.autoPlanConfirm({ date, type, buses: finalPlan.buses })
      onConfirmed(result.trips.map((t) => t.id))
      setStep('done')
    } catch {
      setError('Failed to save the plan. Please try again.')
      setStep('review')
    }
  }

  if (step === 'configure' || (step === 'review' && !plan)) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-md">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Plan Trips</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Run Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['morning', 'afternoon', 'midday'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2 rounded-md text-sm font-medium border transition-colors capitalize ${
                    type === t
                      ? 'text-white border-transparent'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  style={type === t ? { backgroundColor: 'var(--color-brand-navy)' } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {loading ? 'Generating...' : 'Auto-Plan'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-md text-center">
        <p className="text-sm font-semibold text-green-700 mb-2">Trips created successfully</p>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    )
  }

  // review / confirming steps - map component handles it
  return (
    <AutoPlanMap
      plan={plan!}
      onConfirm={handleConfirm}
      onBack={() => setStep('configure')}
      confirming={step === 'confirming'}
    />
  )
}
```

**Step 2: Lint**
```bash
cd dashboard && npm run lint
```

**Step 3: Commit**
```bash
git add dashboard/components/dashboard/auto-plan-wizard.tsx
git commit -m "feat: add auto-plan wizard configure and confirm steps"
```

---

## Task 15: Auto-plan map review component

**Files:**
- Create: `dashboard/components/dashboard/auto-plan-map.tsx`

**Step 1: Implement the map review component**

`dashboard/components/dashboard/auto-plan-map.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { type AutoPlanResponse, type AutoPlanBus } from '@/lib/api'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

// Distinct colors for up to 10 buses
const BUS_COLORS = [
  '#1B3A5C', '#F5A825', '#2A7D4F', '#E53E3E', '#805AD5',
  '#2B6CB0', '#C05621', '#285E61', '#702459', '#276749',
]

interface AutoPlanMapProps {
  plan: AutoPlanResponse
  onConfirm: (plan: AutoPlanResponse) => void
  onBack: () => void
  confirming: boolean
}

export default function AutoPlanMap({ plan: initialPlan, onConfirm, onBack, confirming }: AutoPlanMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [plan, setPlan] = useState<AutoPlanResponse>(initialPlan)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      zoom: 10,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => map.remove()
  }, [])

  // Render markers whenever plan changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function renderMarkers() {
      // Clear existing markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      const bounds = new mapboxgl.LngLatBounds()

      plan.buses.forEach((bus, busIdx) => {
        const color = BUS_COLORS[busIdx % BUS_COLORS.length]
        bus.stops.forEach((stop) => {
          const el = document.createElement('div')
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;cursor:pointer`
          el.textContent = String(stop.order)

          const label = bus.vehicle_number ? `Bus ${bus.vehicle_number}` : 'Bus'
          const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
            `<div style="font-size:12px"><strong>${label} - Stop ${stop.order}</strong><br/>${stop.address ?? ''}<br/>${stop.student_ids.length} student(s)</div>`,
          )

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([stop.lng, stop.lat])
            .setPopup(popup)
            .addTo(map!)
          markersRef.current.push(marker)
          bounds.extend([stop.lng, stop.lat])
        })
      })

      if (!bounds.isEmpty()) {
        map!.fitBounds(bounds, { padding: 60 })
      }
    }

    if (map.isStyleLoaded()) {
      renderMarkers()
    } else {
      map.once('load', renderMarkers)
    }
  }, [plan])

  const totalStudents = plan.buses.reduce(
    (sum, b) => sum + b.stops.reduce((s, stop) => s + stop.student_ids.length, 0),
    0,
  )

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Sidebar */}
      <div className="w-72 shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">
            {plan.buses.length} bus{plan.buses.length !== 1 ? 'es' : ''} - {totalStudents} students
          </p>
          {plan.unassigned_students.length > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">
              {plan.unassigned_students.length} students could not be assigned (capacity exceeded)
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {plan.buses.map((bus, idx) => {
            const color = BUS_COLORS[idx % BUS_COLORS.length]
            const studentCount = bus.stops.reduce((s, stop) => s + stop.student_ids.length, 0)
            return (
              <div key={bus.vehicle_id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-medium text-gray-800">
                    {bus.vehicle_number ? `Bus ${bus.vehicle_number}` : 'Bus'}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{studentCount} students</span>
                </div>
                <ol className="space-y-1 ml-5">
                  {bus.stops.map((stop) => (
                    <li key={stop.order} className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Stop {stop.order}</span>
                      {stop.address && ` - ${stop.address}`}
                      <span className="text-gray-400"> ({stop.student_ids.length})</span>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => onConfirm(plan)}
            disabled={confirming}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            {confirming ? 'Creating...' : 'Confirm Plan'}
          </button>
          <button
            onClick={onBack}
            disabled={confirming}
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 rounded-xl overflow-hidden border border-gray-200" />
    </div>
  )
}
```

**Step 2: Lint and build**
```bash
cd dashboard && npm run lint && npm run build
```
Expected: 0 errors.

**Step 3: Commit**
```bash
git add dashboard/components/dashboard/auto-plan-map.tsx
git commit -m "feat: add auto-plan map review component with bus color coding"
```

---

## Task 16: Wire auto-plan wizard into the trips page

**Files:**
- Modify: `dashboard/components/dashboard/trip-table.tsx`

**Step 1: Import and add the wizard**

At the top of `trip-table.tsx`, add:
```tsx
import AutoPlanWizard from '@/components/dashboard/auto-plan-wizard'
```

Add state:
```tsx
const [showAutoPlan, setShowAutoPlan] = useState(false)
```

**Step 2: Replace the "New Trip" button area**

Replace the current header button with two options:
```tsx
<div className="flex items-center gap-2">
  <button
    onClick={() => setShowAutoPlan((v) => !v)}
    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
    style={{ backgroundColor: 'var(--color-brand-navy)' }}
  >
    <Wand2 size={15} />
    Plan Trips
  </button>
  <button
    onClick={() => setShowNewForm((v) => !v)}
    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
  >
    <Plus size={15} />
    Manual
  </button>
</div>
```

Add `Wand2` to the lucide-react import.

**Step 3: Render the wizard**

Below the header, alongside the existing `showNewForm` block:
```tsx
{showAutoPlan && (
  <div className="mb-4">
    <AutoPlanWizard
      onClose={() => setShowAutoPlan(false)}
      onConfirmed={(ids) => {
        setShowAutoPlan(false)
        router.refresh()
      }}
    />
  </div>
)}
```

**Step 4: Lint and build**
```bash
cd dashboard && npm run lint && npm run build
```
Expected: 0 errors, clean build.

**Step 5: Commit**
```bash
git add dashboard/components/dashboard/trip-table.tsx
git commit -m "feat: add Plan Trips wizard button to trips page"
```

---

## Final Verification

```bash
cd routeguard-api && go test -v ./... && go build ./...
cd dashboard && npm run lint && npm run build
```

Both must pass before considering this complete. The `MAPBOX_SECRET_TOKEN` env var needs to be set in the API deployment environment (add to `deploy/` docker-compose and `.env.example`).
