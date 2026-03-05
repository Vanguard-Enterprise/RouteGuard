# Navigation Map Design

**Date:** 2026-03-05
**Scope:** Driver PWA - Google Maps/Waze-style navigation for ActiveRun and FreeDriveMap

## Problem

The driver's active run screen has no map at all - just a stop name, progress bar, and "Next Stop" button. The free-drive map has GPS tracking and address search but no route drawing or turn-by-turn directions. Both surfaces need a real navigation experience.

## Approach

Mapbox Directions API (REST) + custom nav UI. Uses the existing Mapbox token. No new SDK. Full control over UI to match design system.

Rejected alternatives:
- Mapbox Navigation Web SDK - heavier, less mature for PWA, less UI control
- Deep-link to Google Maps/Apple Maps - driver leaves the app, breaks scan workflow

## Architecture

Three layers of change:

1. **Backend** - Trip manifest endpoint includes `lat`, `lng`, `address` per stop
2. **New `NavigationMap` component** - shared between ActiveRun and FreeDriveMap
3. **ActiveRun redesign + FreeDriveMap enhancement**

## Component: `NavigationMap`

Path: `dashboard/components/driver/navigation-map.tsx`

### Props

```ts
interface NavigationStop {
  id: string
  name: string
  sequence_order: number
  lat: number
  lng: number
  address?: string
}

interface NavigationMapProps {
  stops: NavigationStop[]
  currentStopIdx: number
  onArrival: () => void         // GPS auto-detected arrival
  onManualAdvance: () => void   // driver taps "Arrived"
  mode: 'route' | 'free-drive'
  destination?: { lat: number; lng: number; name: string } // free-drive only
}
```

### Map

- Mapbox fullscreen, `streets-v12` style
- Route line: GeoJSON LineString, navy `#1B3A5C`, 5px - completed segment greyed, active highlighted
- Markers: current stop amber, completed greyed with checkmark, upcoming navy numbered
- Driver dot: blue with heading rotation from GPS
- Camera: follows driver, zoom 16, slight forward tilt

### Turn Banner

Floating card, top-center:
- Direction arrow icon mapped from Mapbox step `maneuver.type` + `maneuver.modifier`
- Street name + distance to maneuver ("Turn left on Oak St - 0.3 mi")
- Secondary line: "Next: [stop name]"

### Floating Stops Panel

Right side, scrollable card:
- Stop number + name per row
- Current stop: amber highlight
- Completed: greyed with checkmark
- Upcoming: normal weight
- Auto-scrolls to current stop on advance

### Arrival Detection

- Haversine distance computed on each GPS update
- `< 50m` from current stop fires `onArrival` (debounced, 10s cooldown)
- Manual "Arrived" button always available as override

## Directions Fetching

Endpoint: `GET https://api.mapbox.com/directions/v5/mapbox/driving/{coords}?steps=true&geometries=geojson`

- On mount: fetch full multi-stop route (all stops as waypoints) to draw complete path
- On `currentStopIdx` change: fetch per-leg for live step instructions
- On deviation >100m from route: silently re-fetch current leg

## ActiveRun Redesign

- `NavigationMap` fills the screen (mode `route`)
- Scan feedback overlay sits on top (z-index)
- "Arrived" manual override button floating bottom-center
- End Run button floating bottom-right
- Simulate Scan dev button preserved
- Simulate Arrival dev button added (fires onArrival directly)

## FreeDriveMap Enhancement

- When destination selected: fetch directions origin to dest, draw route, show turn banner
- No stops panel, no auto-arrival
- "Clear" button removes route and hides banner

## Backend Change

`POST /api/v1/trips/start` manifest response - stop shape extended:

```go
// Before
type ManifestStop struct {
    ID            string `json:"id"`
    Name          string `json:"name"`
    SequenceOrder int    `json:"sequence_order"`
}

// After - add fields already present on domain Stop
type ManifestStop struct {
    ID            string   `json:"id"`
    Name          string   `json:"name"`
    SequenceOrder int      `json:"sequence_order"`
    Lat           *float64 `json:"lat"`
    Lng           *float64 `json:"lng"`
    Address       *string  `json:"address"`
}
```

localStorage key `trip_manifest` same, shape extended.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| GPS unavailable | Banner "GPS unavailable - navigation paused", turn banner freezes, manual Arrived still works |
| Directions API failure | Retry once after 2s, fallback to straight-line segments, toast "Routing unavailable" |
| Stop missing coordinates | Skip in route calculation, show "no location" indicator in stop panel |
| Off-route (>100m) | Silent re-fetch, no "recalculating" UI |
| No manifest / empty stops | NavigationMap falls back to free-drive mode |

## Testing Checkpoints

- Manifest returns stops with lat/lng
- Route line renders for multi-stop trip
- Turn banner updates with GPS movement (simulate via Chrome DevTools location override)
- Auto-arrival at 50m (simulate via DevTools coordinates)
- Manual Arrived works independently
- Off-route reroute fires at 100m
- Stops missing coords handled gracefully
- FreeDriveMap route + banner lifecycle (select dest, navigate, clear)
