# Route School Origin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a school as the fixed origin/destination on routes so the auto-plan optimizer produces better stop orderings and the trip detail page shows where the bus starts and ends.

**Architecture:** Add `school_id` FK to the `routes` table. Enrich `RouteRepo.Get/List` with a LEFT JOIN on schools. Add `school_id` to the auto-plan wizard configure step, inject the school coord as a fixed waypoint in the Mapbox optimization call, and show a school pin on the auto-plan map and trip detail page.

**Tech Stack:** Go 1.24 (pgx, chi), Next.js 16 App Router, React 19, Tailwind v4, Mapbox GL JS, Mapbox Optimization API v1

---

### Task 1: DB migration - add school_id to routes

**Files:**
- Create: `routeguard-api/migrations/012_route_school_id.up.sql`
- Create: `routeguard-api/migrations/012_route_school_id.down.sql`

**Step 1: Create the up migration**

```sql
ALTER TABLE routes ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
```

**Step 2: Create the down migration**

```sql
ALTER TABLE routes DROP COLUMN school_id;
```

**Step 3: Build to confirm Go still compiles (migrations are just SQL files)**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 4: Commit**

```bash
git add routeguard-api/migrations/012_route_school_id.up.sql routeguard-api/migrations/012_route_school_id.down.sql
git commit -m "feat: add school_id FK to routes table"
```

---

### Task 2: Add school fields to Route domain type

**Files:**
- Modify: `routeguard-api/internal/domain/types.go` (Route struct, ~line 291)

**Step 1: Add fields to the Route struct**

Find the `Route` struct and add four fields after `UpdatedAt`:

```go
type Route struct {
    ID                   string    `json:"id"`
    OrgID                string    `json:"org_id"`
    Name                 string    `json:"name"`
    Type                 string    `json:"type"`
    Status               string    `json:"status"`
    Description          *string   `json:"description"`
    EstimatedDurationMin *int      `json:"estimated_duration_min"`
    CreatedAt            time.Time `json:"created_at"`
    UpdatedAt            time.Time `json:"updated_at"`
    // Enriched fields
    SchoolID   *string  `json:"school_id,omitempty"`
    SchoolName *string  `json:"school_name,omitempty"`
    SchoolLat  *float64 `json:"school_lat,omitempty"`
    SchoolLng  *float64 `json:"school_lng,omitempty"`
}
```

**Step 2: Build**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git commit -m "feat: add school enrichment fields to Route domain type"
```

---

### Task 3: Update RouteRepo to JOIN schools and accept school_id

**Files:**
- Modify: `routeguard-api/internal/repository/route_repo.go`

**Step 1: Read the file to understand current Get, List, Create, Update methods**

**Step 2: Replace the Get method**

The current `Get` uses `routeSelectCols` constant with `scanRoute`. Replace with an inline JOIN query that scans 13 fields:

```go
func (r *RouteRepo) Get(ctx context.Context, id, orgID string) (*domain.Route, error) {
    var rt domain.Route
    err := r.pool.QueryRow(ctx, `
        SELECT r.id, r.org_id, r.name, r.type, r.status, r.description, r.estimated_duration_min,
               r.created_at, r.updated_at, r.school_id, s.name, s.lat, s.lng
        FROM routes r
        LEFT JOIN schools s ON s.id = r.school_id
        WHERE r.id = $1 AND r.org_id = $2
    `, id, orgID).Scan(
        &rt.ID, &rt.OrgID, &rt.Name, &rt.Type, &rt.Status,
        &rt.Description, &rt.EstimatedDurationMin,
        &rt.CreatedAt, &rt.UpdatedAt,
        &rt.SchoolID, &rt.SchoolName, &rt.SchoolLat, &rt.SchoolLng,
    )
    if err != nil {
        return nil, err
    }
    return &rt, nil
}
```

**Step 3: Replace the List method**

Find the `List` method. Replace its SELECT and scan to use the same JOIN pattern:

```go
func (r *RouteRepo) List(ctx context.Context, orgID string) ([]domain.Route, error) {
    rows, err := r.pool.Query(ctx, `
        SELECT r.id, r.org_id, r.name, r.type, r.status, r.description, r.estimated_duration_min,
               r.created_at, r.updated_at, r.school_id, s.name, s.lat, s.lng
        FROM routes r
        LEFT JOIN schools s ON s.id = r.school_id
        WHERE r.org_id = $1
        ORDER BY r.created_at DESC
    `, orgID)
    if err != nil {
        return nil, fmt.Errorf("route list: %w", err)
    }
    defer rows.Close()

    routes := make([]domain.Route, 0)
    for rows.Next() {
        var rt domain.Route
        if err := rows.Scan(
            &rt.ID, &rt.OrgID, &rt.Name, &rt.Type, &rt.Status,
            &rt.Description, &rt.EstimatedDurationMin,
            &rt.CreatedAt, &rt.UpdatedAt,
            &rt.SchoolID, &rt.SchoolName, &rt.SchoolLat, &rt.SchoolLng,
        ); err != nil {
            return nil, fmt.Errorf("route list scan: %w", err)
        }
        routes = append(routes, rt)
    }
    return routes, rows.Err()
}
```

**Step 4: Update Create to accept schoolID and return enriched route**

Change the `Create` signature and body:

```go
func (r *RouteRepo) Create(ctx context.Context, orgID, name, routeType, status string, description *string, estimatedDurationMin *int, schoolID *string) (*domain.Route, error) {
    var id string
    err := r.pool.QueryRow(ctx, `
        INSERT INTO routes (id, org_id, name, type, status, description, estimated_duration_min, school_id)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `, orgID, name, routeType, status, description, estimatedDurationMin, schoolID).Scan(&id)
    if err != nil {
        return nil, fmt.Errorf("route create: %w", err)
    }
    return r.Get(ctx, id, orgID)
}
```

**Step 5: Update Update to accept schoolID**

Add `schoolID *string` as the last parameter. Inside the method, add handling alongside the other `setClauses`:

```go
if schoolID != nil {
    args = append(args, *schoolID)
    setClauses = append(setClauses, fmt.Sprintf("school_id = $%d", len(args)))
}
```

Change the final `return r.Get(ctx, id, orgID)` — the `Update` method already calls `Get` when there are no changes, but when there are changes it uses `RETURNING routeSelectCols`. Change the RETURNING path to also return via `Get`:

In the case where `len(setClauses) == 0`, the method already calls `r.Get`. For the update case, after executing the UPDATE, instead of scanning `RETURNING routeSelectCols`, scan `RETURNING id` and then call `r.Get`:

```go
// Replace the end of Update (the query + scan) with:
args = append(args, id)
idParam := fmt.Sprintf("$%d", len(args))
args = append(args, orgID)
orgParam := fmt.Sprintf("$%d", len(args))

query := fmt.Sprintf(`
    UPDATE routes
    SET %s, updated_at = now()
    WHERE id = %s AND org_id = %s
    RETURNING id
`, strings.Join(setClauses, ", "), idParam, orgParam)

var updatedID string
if err := r.pool.QueryRow(ctx, query, args...).Scan(&updatedID); err != nil {
    return nil, fmt.Errorf("route update: %w", err)
}
return r.Get(ctx, updatedID, orgID)
```

**Step 6: Build**

```bash
cd routeguard-api && go build ./...
```

Expected: no errors. Fix any compile errors (usually type mismatches in the Update function's args).

**Step 7: Commit**

```bash
git add routeguard-api/internal/repository/route_repo.go
git commit -m "feat: enrich RouteRepo with school JOIN, add school_id to Create/Update"
```

---

### Task 4: Update route_handler.go to accept school_id

**Files:**
- Modify: `routeguard-api/internal/api/route_handler.go`

**Step 1: Read the file**

**Step 2: Add SchoolID to request structs**

Find `createRouteRequest` and `updateRouteRequest` and add `SchoolID *string` to each:

```go
type createRouteRequest struct {
    Name                 string  `json:"name"`
    Type                 string  `json:"type"`
    Status               string  `json:"status"`
    Description          *string `json:"description"`
    EstimatedDurationMin *int    `json:"estimated_duration_min"`
    SchoolID             *string `json:"school_id"`
}

type updateRouteRequest struct {
    Name                 *string `json:"name"`
    Type                 *string `json:"type"`
    Status               *string `json:"status"`
    Description          *string `json:"description"`
    EstimatedDurationMin *int    `json:"estimated_duration_min"`
    SchoolID             *string `json:"school_id"`
}
```

**Step 3: Pass school_id in CreateRoute handler**

Find the call to `repo.Create(...)` in the `CreateRoute` handler and add `req.SchoolID` as the last argument.

**Step 4: Pass school_id in UpdateRoute handler**

Find the call to `repo.Update(...)` in the `UpdateRoute` handler and add `req.SchoolID` as the last argument.

**Step 5: Build**

```bash
cd routeguard-api && go build ./cmd/api
```

Expected: no errors.

**Step 6: Commit**

```bash
git add routeguard-api/internal/api/route_handler.go
git commit -m "feat: pass school_id through route create/update handlers"
```

---

### Task 5: Update auto-plan handler to use school as fixed waypoint

**Files:**
- Modify: `routeguard-api/internal/api/autoplan_handler.go`

**Step 1: Read the file**

**Step 2: Add SchoolID to autoPlanRequest**

```go
type autoPlanRequest struct {
    Date     string  `json:"date"`
    Type     string  `json:"type"`
    SchoolID *string `json:"school_id"`
}
```

**Step 3: Add school fields to autoPlanResponse**

```go
type autoPlanResponse struct {
    Buses              []autoPlanBus `json:"buses"`
    UnassignedStudents []string      `json:"unassigned_students"`
    SchoolLat          *float64      `json:"school_lat,omitempty"`
    SchoolLng          *float64      `json:"school_lng,omitempty"`
    SchoolName         *string       `json:"school_name,omitempty"`
}
```

**Step 4: Fetch school and inject into optimization in AutoPlanTrips**

After fetching students and vehicles, add this block to fetch the school if provided:

```go
var schoolLat, schoolLng *float64
var schoolName *string
if req.SchoolID != nil && *req.SchoolID != "" {
    var slat, slng float64
    var sname string
    err := h.pool.QueryRow(r.Context(), `
        SELECT name, lat, lng FROM schools WHERE id = $1 AND org_id = $2
    `, *req.SchoolID, orgID).Scan(&sname, &slat, &slng)
    if err == nil {
        schoolLat = &slat
        schoolLng = &slng
        schoolName = &sname
    }
}
```

Then in the per-bus optimization loop, inject the school as a fixed endpoint. Replace the `ordered, _ := autoplan.OptimizeStops(...)` call with:

```go
ptsToOptimize := g.Points
schoolPoint := autoplan.StudentPoint{ID: "_school"}
hasSchool := schoolLat != nil && schoolLng != nil

if hasSchool {
    schoolPoint.Lat = *schoolLat
    schoolPoint.Lng = *schoolLng
    if req.Type == "afternoon" || req.Type == "midday" {
        // school is origin: prepend
        ptsToOptimize = append([]autoplan.StudentPoint{schoolPoint}, g.Points...)
    } else {
        // school is destination: append
        ptsToOptimize = append(g.Points, schoolPoint)
    }
}

ordered, _ := autoplan.OptimizeStops(r.Context(), mapboxToken, ptsToOptimize)

// Strip the school point from the result
if hasSchool {
    filtered := make([]autoplan.StudentPoint, 0, len(ordered))
    for _, p := range ordered {
        if p.ID != "_school" {
            filtered = append(filtered, p)
        }
    }
    ordered = filtered
}
```

**Step 5: Set school fields on the response**

After the bus loop, set:

```go
resp.SchoolLat = schoolLat
resp.SchoolLng = schoolLng
resp.SchoolName = schoolName
```

**Step 6: Update AutoPlanConfirm to store school_id on created routes**

Find `autoPlanConfirmRequest` and add `SchoolID *string`:

```go
type autoPlanConfirmRequest struct {
    Date     string       `json:"date"`
    Type     string       `json:"type"`
    Buses    []confirmBus `json:"buses"`
    SchoolID *string      `json:"school_id"`
}
```

Find the `INSERT INTO routes` in `AutoPlanConfirm` and add `school_id`:

```go
err = tx.QueryRow(ctx, `
    INSERT INTO routes (id, org_id, name, type, status, school_id, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, now(), now())
    RETURNING id
`, orgID, routeName, req.Type, req.SchoolID).Scan(&routeID)
```

**Step 7: Build**

```bash
cd routeguard-api && go build ./cmd/api
```

Expected: no errors.

**Step 8: Commit**

```bash
git add routeguard-api/internal/api/autoplan_handler.go
git commit -m "feat: inject school as fixed waypoint in auto-plan optimizer"
```

---

### Task 6: Update dashboard/lib/api.ts

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Read the file to find Route interface and AutoPlan types**

**Step 2: Add school fields to Route interface**

Find the `Route` interface and add after the existing fields:

```ts
export interface Route {
  id: string
  org_id: string
  name: string
  type: string
  status: string
  description: string | null
  estimated_duration_min: number | null
  created_at: string
  updated_at: string
  school_id?: string | null
  school_name?: string | null
  school_lat?: number | null
  school_lng?: number | null
}
```

**Step 3: Add school_id to AutoPlanResponse and update request type**

Find `AutoPlanResponse` (or equivalent interface) and add:
```ts
export interface AutoPlanResponse {
  buses: AutoPlanBus[]
  unassigned_students: string[]
  school_lat?: number | null
  school_lng?: number | null
  school_name?: string | null
}
```

Find `AutoPlanConfirmRequest` and add `school_id`:
```ts
export interface AutoPlanConfirmRequest {
  date: string
  type: string
  buses: AutoPlanBus[]
  school_id?: string | null
}
```

**Step 4: Update api.trips.autoplan to accept school_id**

Find the `autoplan` method:
```ts
autoplan: (date: string, type: string, schoolId?: string | null) =>
  request<AutoPlanResponse>('/dashboard/trips/auto-plan', {
    method: 'POST',
    body: JSON.stringify({ date, type, school_id: schoolId ?? null }),
  }),
```

**Step 5: Lint**

```bash
cd dashboard && npm run lint
```

Expected: 0 new errors.

**Step 6: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add school fields to Route/AutoPlan types in api.ts"
```

---

### Task 7: Add school picker to route-form.tsx

**Files:**
- Modify: `dashboard/components/dashboard/route-form.tsx`

**Step 1: Read the file**

**Step 2: Add school_id to schema and load schools**

Add to the zod schema:
```ts
school_id: z.string().optional(),
```

Add imports at top:
```ts
import { useState, useEffect } from 'react'
import { api, Route, School } from '@/lib/api'
```

Add state and effect inside the component, before the `useForm` call:
```ts
const [schools, setSchools] = useState<School[]>([])
useEffect(() => {
  api.schools.list().then(setSchools).catch(() => {})
}, [])
```

Add `school_id` to `defaultValues`:
```ts
school_id: route?.school_id ?? '',
```

**Step 3: Add school dropdown to the form**

Add after the Type field and before Description:

```tsx
<div>
  <label htmlFor="school_id" className="block text-sm font-medium text-gray-700 mb-1">
    School (start/end point)
  </label>
  <select
    id="school_id"
    {...register('school_id')}
    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white"
  >
    <option value="">None</option>
    {schools.map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}
      </option>
    ))}
  </select>
</div>
```

**Step 4: Pass school_id in the submit payload**

In `onSubmit`, add to the payload:
```ts
school_id: data.school_id || null,
```

**Step 5: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 new errors, build succeeds.

**Step 6: Commit**

```bash
git add dashboard/components/dashboard/route-form.tsx
git commit -m "feat: add school picker to route form"
```

---

### Task 8: Add school picker to auto-plan wizard

**Files:**
- Modify: `dashboard/components/dashboard/auto-plan-wizard.tsx`

**Step 1: Read the file to understand the configure step UI**

**Step 2: Load schools and add school_id state**

Add to the component:
```ts
const [schools, setSchools] = useState<School[]>([])
const [schoolId, setSchoolId] = useState<string>('')
```

Add import: `import { api, School, AutoPlanResponse } from '@/lib/api'`

Add effect:
```ts
useEffect(() => {
  api.schools.list().then(setSchools).catch(() => {})
}, [])
```

**Step 3: Add school dropdown to the configure step UI**

After the Run Type toggle buttons, add:

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
  <select
    value={schoolId}
    onChange={(e) => setSchoolId(e.target.value)}
    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white"
  >
    <option value="">No school (optimize freely)</option>
    {schools.map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}
      </option>
    ))}
  </select>
</div>
```

**Step 4: Pass school_id in the auto-plan API call**

Find the call to `api.trips.autoplan(date, tripType)` and update to:
```ts
api.trips.autoplan(date, tripType, schoolId || null)
```

**Step 5: Pass school_id in the confirm payload**

Find where `api.trips.autoPlanConfirm(...)` is called. Add `school_id: schoolId || null` to the payload.

**Step 6: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 new errors, build succeeds.

**Step 7: Commit**

```bash
git add dashboard/components/dashboard/auto-plan-wizard.tsx
git commit -m "feat: add school picker to auto-plan wizard configure step"
```

---

### Task 9: Show school pin on auto-plan map

**Files:**
- Modify: `dashboard/components/dashboard/auto-plan-map.tsx`

**Step 1: Read the file**

**Step 2: Add school marker to the renderMarkers function**

The `AutoPlanResponse` now has `school_lat`, `school_lng`, `school_name`. In the `renderMarkers` function (inside the useEffect that renders markers), after the bus stops loop, add:

```ts
// School pin
if (plan.school_lat && plan.school_lng) {
  const el = document.createElement('div')
  el.style.cssText = `width:32px;height:32px;border-radius:4px;background:#1B3A5C;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;cursor:pointer`
  el.textContent = '🏫'
  const marker = new mapboxgl.Marker({ element: el })
    .setLngLat([plan.school_lng, plan.school_lat])
    .addTo(map!)
  if (plan.school_name) {
    marker.setPopup(new mapboxgl.Popup({ offset: 25 }).setText(plan.school_name))
  }
  markersRef.current.push(marker)
  bounds.extend([plan.school_lng, plan.school_lat])
}
```

Also include school in the sidebar - add above the bus list:

```tsx
{plan.school_name && (
  <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 text-sm text-gray-600">
    <span>🏫</span>
    <span>{plan.school_name}</span>
  </div>
)}
```

**Step 3: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 new errors.

**Step 4: Commit**

```bash
git add dashboard/components/dashboard/auto-plan-map.tsx
git commit -m "feat: show school as fixed pin on auto-plan map"
```

---

### Task 10: Show school on trip detail page

**Files:**
- Modify: `routeguard-api/internal/repository/trip_repo.go` (TripRepo.Get)
- Modify: `routeguard-api/internal/domain/types.go` (Trip struct)
- Modify: `dashboard/lib/api.ts` (Trip interface)
- Modify: `dashboard/components/dashboard/trip-detail-map.tsx`

**Step 1: Add SchoolName to Trip domain type**

In `routeguard-api/internal/domain/types.go`, add after `DriverName` in the Trip struct:

```go
SchoolName *string `json:"school_name,omitempty"`
```

**Step 2: Enrich TripRepo.Get with school info**

In `routeguard-api/internal/repository/trip_repo.go`, find the `Get` method. Extend the JOIN query to also join routes and schools:

```go
func (r *TripRepo) Get(ctx context.Context, id, orgID string) (*domain.Trip, error) {
    var t domain.Trip
    err := r.pool.QueryRow(ctx, `
        SELECT
            t.id, t.route_assignment_id, t.org_id, t.date, t.status,
            t.started_at, t.completed_at, t.notes, t.created_at,
            r.name AS route_name, v.number AS vehicle_number,
            ra.driver_id, u.name AS driver_name,
            s.name AS school_name
        FROM trips t
        LEFT JOIN route_assignments ra ON ra.id = t.route_assignment_id
        LEFT JOIN routes r ON r.id = ra.route_id
        LEFT JOIN vehicles v ON v.id = ra.vehicle_id
        LEFT JOIN users u ON u.id = ra.driver_id
        LEFT JOIN schools s ON s.id = r.school_id
        WHERE t.id = $1 AND t.org_id = $2
    `, id, orgID).Scan(
        &t.ID, &t.RouteAssignmentID, &t.OrgID, &t.Date, &t.Status,
        &t.StartedAt, &t.CompletedAt, &t.Notes, &t.CreatedAt,
        &t.RouteName, &t.VehicleNumber,
        &t.DriverID, &t.DriverName,
        &t.SchoolName,
    )
    if err != nil {
        return nil, err
    }
    return &t, nil
}
```

**Step 3: Add school_name to Trip interface in api.ts**

```ts
school_name?: string | null
```

**Step 4: Show school in trip-detail-map.tsx**

In the metadata dl grid, add a school row after the Bus row:

```tsx
{trip.school_name && (
  <div className="flex flex-col">
    <dt className="text-xs text-gray-500">School</dt>
    <dd className="text-sm text-gray-900 mt-0.5">{trip.school_name}</dd>
  </div>
)}
```

**Step 5: Build everything**

```bash
cd routeguard-api && go build ./cmd/api
cd ../dashboard && npm run build
```

Expected: both pass.

**Step 6: Commit**

```bash
git add routeguard-api/internal/domain/types.go routeguard-api/internal/repository/trip_repo.go dashboard/lib/api.ts dashboard/components/dashboard/trip-detail-map.tsx
git commit -m "feat: show school name on trip detail page"
```
