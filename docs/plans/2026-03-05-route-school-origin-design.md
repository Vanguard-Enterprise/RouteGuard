# Route School Origin Design

**Date:** 2026-03-05

## Goal

Add a school as the fixed origin/destination for each route so the auto-plan optimizer and trip detail page know where the bus starts and ends.

## Problem

Routes currently have no start or end location - only student pickup stops. The Mapbox optimizer treats the first student stop as source and last as destination, producing suboptimal orderings. Trip and auto-plan views give no indication of where the bus originates.

## Design

### Data Model

Add a nullable `school_id` FK to the `routes` table:

```sql
ALTER TABLE routes ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
```

Nullable so existing routes remain valid. The school provides name, address, lat, and lng via JOIN.

### Route Type Logic

The route `type` field determines how the school coordinates are used in optimization:

- `morning`: school is the **destination** (bus picks up students, ends at school)
- `afternoon`: school is the **origin** (bus starts at school, drops students off)
- `field_trip` / `activity`: school is the **origin**

### API Changes

- `GET /dashboard/routes/{id}` - include `school_id` and joined `school_name`, `school_address` in response
- `POST /dashboard/routes` and `PATCH /dashboard/routes/{id}` - accept `school_id`
- `POST /dashboard/trips/auto-plan` - when route has a school, inject school coords as first or last waypoint before calling Mapbox
- `GET /dashboard/trips/{id}` - include school info via route join

### Dashboard Changes

- **Route form:** Add school dropdown (same pattern as other dropdowns in the codebase)
- **Auto-plan wizard map:** Show school as a distinct navy pin with a school icon; student stops remain numbered circles
- **Trip detail page:** Show "School" field in the Trip Details metadata section

### Out of Scope (Future)

- Per-driver start location (driver's home)
- Multiple schools per route
- Non-school depot locations
