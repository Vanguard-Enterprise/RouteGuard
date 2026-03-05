# Dashboard Simplification and Auto-Routing Design

## Problem

The RouteGuard dashboard is overly complex for its primary users - transportation coordinators and school admins. Specific pain points:

- Forms ask for too many fields upfront (vehicle form has 9 fields, student form has 12)
- Trip creation is fully manual and requires understanding internal data structures (raw UUIDs shown in the trips table)
- No automated way to group students onto buses and plan routes - everything is done by hand
- Navigation has 9 sidebar items with no role-based grouping

## Goals

1. Simplify all forms to show only essential fields; hide advanced fields behind a collapsible
2. Replace manual trip creation with a smart auto-plan wizard that clusters students onto buses, optimizes stop order using the Mapbox Optimization API, and lets coordinators review and adjust before confirming
3. Fix the trips table to show human-readable route and bus info instead of raw UUIDs

## Section 1 - Form Simplification

### Vehicle Form

Primary fields (always shown):
- Bus Number (maps to `number`)
- Capacity (max students, maps to `capacity`)
- Device (assign the kiosk device to this bus - new field linking `devices` to `vehicles`)

Advanced section (collapsible, closed by default):
- Name, Make, Model, Year, VIN, License Plate, Status

Bus Number becomes the primary display identifier for vehicles throughout the UI.

### Student Form

Primary fields (always shown):
- First Name, Last Name
- School (dropdown)
- Address (autocomplete, auto-populates lat/lng on selection)

More Details section (collapsible, closed by default):
- Grade, Student Number, Status, Medical Notes, RFID Tag

### Trips Table

Replace the `route_assignment_id` UUID column with Route Name + Bus Number. The frontend resolves these from the enriched API response (the list endpoint should return route name and vehicle number alongside each trip).

## Section 2 - Auto-Plan Trips Wizard

A new 3-step wizard replaces the manual "New Trip" form.

### Step 1 - Configure

Coordinator selects:
- Date
- Run type: Morning, Afternoon, or Midday

The UI shows how many active students with geocoded addresses will be included in the plan.

### Step 2 - Review Plan

The frontend calls `POST /api/v1/trips/auto-plan` and renders the result on a Mapbox map.

Display:
- Each bus is assigned a distinct color
- Students appear as map pins colored by their assigned bus
- Optimized route lines per bus
- Sidebar panel listing each bus: stop sequence, students per stop, total passenger count

Coordinator interactions:
- Drag a student pin to reassign them to a different bus
- Click a stop pin to see which students board there; remove individual students
- Reorder stops within a bus via the sidebar (drag handles)
- All changes are tracked client-side and included in the confirm payload

### Step 3 - Confirm

Single button press calls `POST /api/v1/trips/auto-plan/confirm` with the (possibly modified) plan. All records are created atomically. Coordinator is redirected to the trips list showing the newly created trips.

## Section 3 - Backend Changes

### New Endpoint: POST /api/v1/trips/auto-plan

Stateless - computes and returns a plan without persisting anything.

Request:
```json
{
  "date": "2026-03-05",
  "type": "morning"
}
```

Response:
```json
{
  "buses": [
    {
      "vehicle_id": "...",
      "vehicle_number": "Bus 12",
      "stops": [
        {
          "order": 1,
          "lat": 37.123,
          "lng": -122.456,
          "address": "123 Main St",
          "student_ids": ["...", "..."]
        }
      ]
    }
  ],
  "unassigned_students": []
}
```

Algorithm:
1. Fetch all active students with non-null lat/lng for the org
2. Fetch all active vehicles with capacity
3. Use a nearest-neighbor greedy algorithm to cluster students into bus groups respecting each bus's capacity
4. For each group, call the Mapbox Optimization API (`GET /optimized-trips/v1/mapbox/driving`) to determine optimal stop order
5. Return the clustered, ordered plan

### New Endpoint: POST /api/v1/trips/auto-plan/confirm

Takes the plan (same shape as the auto-plan response, may have been modified by the coordinator) and creates all records in a single database transaction:

1. For each bus in the plan, create or reuse a `Route` record (name derived from date + type + bus number, e.g. "Morning - Bus 12 - 2026-03-05")
2. Create `Stop` records with sequence_order from the plan
3. Create `StudentStop` records linking students to their stops
4. Create a `RouteAssignment` record with the vehicle_id, no driver (coordinator can assign later), effective_date = date, days_of_week = day of week
5. Create a `Trip` record with status = "scheduled"

### Config Changes

Add `MAPBOX_API_KEY` to the API config struct and env loading. Used only by the auto-plan endpoint.

### Enriched Trip List Response

The existing `GET /api/v1/trips` endpoint should return `route_name` and `vehicle_number` fields alongside each trip so the frontend can render them without additional requests.

## Data Model

No new tables are required. The existing `stops`, `student_stops`, `route_assignments`, and `trips` tables fully support the auto-plan output. The only schema addition is a `device_id` foreign key on the `vehicles` table to support the device assignment field in the vehicle form.

## Out of Scope

- Real-time re-routing during an active trip
- Multi-school routing optimization in a single plan (each plan run is per-org, but cross-school clustering is included)
- Driver assignment in the auto-plan wizard (coordinators assign drivers separately after plan confirmation)
- Turn-by-turn navigation for drivers (handled by the kiosk device separately)
