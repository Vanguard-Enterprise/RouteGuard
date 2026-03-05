# Navigation Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Waze-style navigation to the driver PWA - full-screen map with road-snapped route line, turn-by-turn banner, floating stops panel, and GPS arrival detection.

**Architecture:** A new shared `NavigationMap` component owns the Mapbox map, GPS tracking, Directions API calls, turn banner, and floating stops panel. `ActiveRun` is rebuilt around it with scan workflow overlaid on top. `FreeDriveMap` gains route drawing and turn banner when a destination is selected.

**Tech Stack:** Mapbox GL JS (already installed), Mapbox Directions API v5 (REST, uses existing `NEXT_PUBLIC_MAPBOX_TOKEN`), Lucide React icons, Tailwind v4, React 19.

---

## Important Context

### No backend changes needed
`domain.Stop` already has `Lat *float64`, `Lng *float64`, `Address *string`. The manifest endpoint (`POST /api/v1/trips/start`) already serializes them inside each `StopWithStudents.Stop`. The frontend just never reads these fields.

### Existing bug to fix in Task 1
The manifest is stored in localStorage as `Array<{ stop: { id, name, lat, lng, ... }, students: [] }>` but `active-run.tsx` reads it as a flat `Stop[]` with `{ id, name, order }`. This means `currentStop?.name` is always `undefined` and the driver sees "Unknown Stop". Task 1 fixes this.

### File map
- `dashboard/app/driver/pre-trip/page.tsx` - fetches manifest, saves to localStorage
- `dashboard/components/driver/active-run.tsx` - in-trip driver screen (no map currently)
- `dashboard/components/driver/free-drive-map.tsx` - free-drive map (GPS + search, no routing)
- `dashboard/components/map/map-view.tsx` - admin map view, not changed in this plan

---

## Task 1: Fix manifest types and localStorage parsing

**Files:**
- Modify: `dashboard/app/driver/pre-trip/page.tsx:27-35`
- Modify: `dashboard/components/driver/active-run.tsx:22-26`

**What to do:**

In `pre-trip/page.tsx`, update the `TripManifest` interface to include coordinates on each stop:

```ts
interface ManifestStop {
  id: string
  name: string
  sequence_order: number
  lat: number | null
  lng: number | null
  address: string | null
}

interface TripManifest {
  trip: { id: string }
  stops: Array<{ stop: ManifestStop; students: ManifestStudent[] }>
}
```

The localStorage save line (`line 151`) stores `data.stops` which is `Array<{ stop: ManifestStop, students: [] }>`. Leave that as-is - the shape is correct, the type was just wrong.

In `active-run.tsx`, fix the `Stop` interface and the manifest parsing to unwrap the nested `stop` key:

```ts
export interface ActiveRunStop {
  id: string
  name: string
  sequence_order: number
  lat: number | null
  lng: number | null
  address: string | null
}
```

Update the `useEffect` that reads from localStorage (currently lines 45-55):

```ts
useEffect(() => {
  const raw = localStorage.getItem('trip_manifest')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<{ stop: ActiveRunStop; students: unknown[] }>
      setStops(parsed.map((item) => item.stop))
    } catch {
      setStops([])
    }
  }
}, [])
```

Update the `stops` state type: `const [stops, setStops] = useState<ActiveRunStop[]>([])`

Update the `currentStop` reference and the stop list passed to the `Stop` interface:
```ts
const currentStop = stops[currentStopIdx]
```
The `handleNextStop` function, `progressPct`, and render references to `currentStop?.name` all still work - no other changes needed in `active-run.tsx` yet (the full redesign is in Task 3).

**Step 1:** Make the edits above in both files.

**Step 2:** Verify the dashboard builds cleanly:
```bash
cd dashboard && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors related to `TripManifest` or `Stop`.

**Step 3:** Commit:
```bash
git add dashboard/app/driver/pre-trip/page.tsx dashboard/components/driver/active-run.tsx
git commit -m "fix: correct manifest types and stop parsing in active-run"
```

---

## Task 2: Create the NavigationMap component - utilities and types

**Files:**
- Create: `dashboard/components/driver/navigation-map.tsx`

**What to do:**

Create the file with the types, utility functions, and Directions API helper. No map rendering yet - just the foundation.

```tsx
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  ArrowUp, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight,
  Flag, RotateCcw, MapPin, CheckCircle2, Navigation,
} from 'lucide-react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

const ARRIVAL_RADIUS_M = 50
const ARRIVAL_COOLDOWN_MS = 10_000
const REROUTE_DEVIATION_M = 100

export interface NavigationStop {
  id: string
  name: string
  sequence_order: number
  lat: number | null
  lng: number | null
  address?: string | null
}

export interface NavigationMapProps {
  mode: 'route' | 'free-drive'
  // route mode
  stops?: NavigationStop[]
  currentStopIdx?: number
  onArrival?: () => void
  onManualAdvance?: () => void
  // free-drive mode
  destination?: { lat: number; lng: number; name: string } | null
  // shared
  onPositionUpdate?: (lat: number, lng: number, heading: number | null, speed: number | null) => void
  children?: React.ReactNode
}

interface DirectionsStep {
  distance: number
  maneuver: {
    type: string
    modifier?: string
    instruction: string
    location: [number, number]
  }
  name: string
}

interface DirectionsLeg {
  steps: DirectionsStep[]
}

interface DirectionsRoute {
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  legs: DirectionsLeg[]
  distance: number
}

// Haversine distance in meters between two lat/lng points
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Format meters as human-readable distance (US units)
function formatDist(meters: number): string {
  const feet = meters * 3.281
  if (feet < 1000) return `${Math.max(50, Math.round(feet / 50) * 50)} ft`
  return `${(meters / 1609.34).toFixed(1)} mi`
}

// Map Mapbox maneuver type+modifier to a Lucide icon element
function ManeuverIcon({ type, modifier }: { type: string; modifier?: string }) {
  if (type === 'arrive') return <Flag className="size-7" />
  if (type === 'roundabout' || type === 'rotary') return <RotateCcw className="size-7" />
  if (
    type === 'turn' ||
    type === 'end of road' ||
    type === 'fork' ||
    type === 'merge' ||
    type === 'on ramp' ||
    type === 'off ramp'
  ) {
    if (modifier?.includes('slight left')) return <ArrowUpLeft className="size-7" />
    if (modifier?.includes('slight right')) return <ArrowUpRight className="size-7" />
    if (modifier?.includes('left')) return <ArrowLeft className="size-7" />
    if (modifier?.includes('right')) return <ArrowRight className="size-7" />
  }
  return <ArrowUp className="size-7" />
}

// Fetch directions from Mapbox between an ordered list of [lng, lat] waypoints
async function fetchDirections(coords: [number, number][]): Promise<DirectionsRoute | null> {
  if (coords.length < 2) return null
  const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';')
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    )
    if (!res.ok) return null
    const data = (await res.json()) as { routes?: DirectionsRoute[] }
    return data.routes?.[0] ?? null
  } catch {
    return null
  }
}
```

**Step 1:** Create the file with the above content (no default export yet - add a placeholder):
```tsx
export default function NavigationMap(_props: NavigationMapProps) {
  return <div className="w-full h-full" />
}
```

**Step 2:** Build check:
```bash
cd dashboard && npm run build 2>&1 | tail -20
```
Expected: passes (the placeholder component compiles fine).

**Step 3:** Commit:
```bash
git add dashboard/components/driver/navigation-map.tsx
git commit -m "feat: scaffold NavigationMap component with types and utilities"
```

---

## Task 3: Implement NavigationMap - map, GPS, route drawing

**Files:**
- Modify: `dashboard/components/driver/navigation-map.tsx`

**What to do:**

Replace the placeholder `export default function` with the full implementation. The component is long - implement it in three logical sections described below. Write all three sections before saving.

### Section A: State and refs

```tsx
export default function NavigationMap({
  mode,
  stops = [],
  currentStopIdx = 0,
  onArrival,
  onManualAdvance,
  destination,
  onPositionUpdate,
  children,
}: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRefs = useRef<mapboxgl.Marker[]>([])
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastArrivalRef = useRef<number>(0)
  const lastRouteCheckRef = useRef<{ lat: number; lng: number } | null>(null)
  const routeRef = useRef<DirectionsRoute | null>(null)

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [currentStep, setCurrentStep] = useState<DirectionsStep | null>(null)
  const [stepDistM, setStepDistM] = useState<number | null>(null)
  const [routeError, setRouteError] = useState(false)
  const [gpsDenied, setGpsDenied] = useState(false)
```

### Section B: Map initialization

```tsx
  // Init map
  useEffect(() => {
    if (!containerRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5, 39.5],
      zoom: 4,
      pitchWithRotate: false,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

### Section C: Directions fetch and route line

Write a `loadRoute` function as a `useCallback` that:
1. Collects valid stops (those with non-null lat/lng) starting from `currentStopIdx`
2. If the user has a position, prepends it as the first waypoint
3. Calls `fetchDirections`
4. Stores the result in `routeRef.current`
5. Draws/updates a `'route'` GeoJSON source and `'route-line'` layer on the map

```tsx
  const loadRoute = useCallback(
    async (fromPos?: { lat: number; lng: number }) => {
      const map = mapRef.current
      if (!map || !map.loaded()) return

      const validStops = stops
        .slice(mode === 'route' ? currentStopIdx : 0)
        .filter((s) => s.lat != null && s.lng != null)

      const waypoints: [number, number][] =
        mode === 'free-drive' && destination
          ? fromPos
            ? [[fromPos.lng, fromPos.lat], [destination.lng, destination.lat]]
            : [[destination.lng, destination.lat]]
          : fromPos
            ? [[fromPos.lng, fromPos.lat], ...validStops.map((s) => [s.lng!, s.lat!] as [number, number])]
            : validStops.map((s) => [s.lng!, s.lat!] as [number, number])

      if (waypoints.length < 2) return

      const route = await fetchDirections(waypoints)
      if (!route) {
        setRouteError(true)
        // Fall back to straight-line polyline between stop coordinates
        const fallbackCoords = waypoints
        drawRouteGeometry(map, { type: 'LineString', coordinates: fallbackCoords })
        return
      }

      setRouteError(false)
      routeRef.current = route
      drawRouteGeometry(map, route.geometry)

      // Set initial step for turn banner (first step of first leg)
      const firstStep = route.legs[0]?.steps[0]
      if (firstStep) {
        setCurrentStep(firstStep)
        setStepDistM(firstStep.distance)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, currentStopIdx, destination, mode]
  )

  function drawRouteGeometry(
    map: mapboxgl.Map,
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  ) {
    if (map.getSource('route')) {
      (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geometry as GeoJSON.Geometry)
    } else {
      map.addSource('route', { type: 'geojson', data: geometry as GeoJSON.Geometry })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#1B3A5C',
          'line-width': 5,
          'line-cap': 'round',
          'line-join': 'round',
        },
      })
    }
  }
```

### Section D: Stop markers

```tsx
  // Draw stop markers whenever stops or currentStopIdx changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const addMarkers = () => {
      markerRefs.current.forEach((m) => m.remove())
      markerRefs.current = []

      stops.forEach((stop, idx) => {
        if (stop.lat == null || stop.lng == null) return

        const completed = idx < currentStopIdx
        const isCurrent = idx === currentStopIdx

        const el = document.createElement('div')
        el.style.cssText = [
          'width:28px', 'height:28px', 'border-radius:50%',
          `background:${isCurrent ? '#F5A825' : completed ? '#9ca3af' : '#1B3A5C'}`,
          'color:#fff', 'display:flex', 'align-items:center', 'justify-content:center',
          'font-size:11px', 'font-weight:700', 'border:2px solid #fff',
          'box-shadow:0 1px 4px rgba(0,0,0,0.3)', 'cursor:default',
        ].join(';')
        el.textContent = String(stop.sequence_order)

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([stop.lng, stop.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setHTML(
              `<strong>${stop.name}</strong>${stop.address ? `<br/>${stop.address}` : ''}`
            )
          )
          .addTo(map)
        markerRefs.current.push(marker)
      })
    }

    if (map.loaded()) addMarkers()
    else map.once('load', addMarkers)
  }, [stops, currentStopIdx])
```

### Section E: GPS tracking and arrival detection

```tsx
  useEffect(() => {
    if (!navigator.geolocation) return

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, heading, speed } = pos.coords
      setUserPos({ lat, lng })
      onPositionUpdate?.(lat, lng, heading, speed)

      const map = mapRef.current

      // Update or create driver marker
      if (map) {
        if (driverMarkerRef.current) {
          driverMarkerRef.current.setLngLat([lng, lat])
        } else {
          const dot = document.createElement('div')
          dot.style.cssText = [
            'width:20px', 'height:20px', 'border-radius:50%',
            'background:#3b82f6', 'border:3px solid #fff',
            'box-shadow:0 0 0 4px rgba(59,130,246,0.25)',
          ].join(';')
          if (map.loaded()) {
            driverMarkerRef.current = new mapboxgl.Marker({ element: dot })
              .setLngLat([lng, lat])
              .addTo(map)
          }
        }

        // Follow driver
        map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) })
      }

      // Arrival detection (route mode only)
      if (mode === 'route' && stops.length > 0) {
        const target = stops[currentStopIdx]
        if (target?.lat != null && target?.lng != null) {
          const dist = haversineMeters(lat, lng, target.lat, target.lng)
          const now = Date.now()
          if (dist < ARRIVAL_RADIUS_M && now - lastArrivalRef.current > ARRIVAL_COOLDOWN_MS) {
            lastArrivalRef.current = now
            onArrival?.()
          }
        }
      }

      // Off-route detection - re-fetch directions if deviated
      const last = lastRouteCheckRef.current
      if (last && routeRef.current) {
        const moved = haversineMeters(lat, lng, last.lat, last.lng)
        if (moved > REROUTE_DEVIATION_M) {
          lastRouteCheckRef.current = { lat, lng }
          // Check distance from route geometry
          const routeCoords = routeRef.current.geometry.coordinates
          const minDist = Math.min(
            ...routeCoords.map(([rLng, rLat]) => haversineMeters(lat, lng, rLat, rLng))
          )
          if (minDist > REROUTE_DEVIATION_M) {
            loadRoute({ lat, lng })
          }
        }
      } else {
        lastRouteCheckRef.current = { lat, lng }
      }

      // Update turn banner step distance
      if (currentStep) {
        const [stepLng, stepLat] = currentStep.maneuver.location
        const distToStep = haversineMeters(lat, lng, stepLat, stepLng)
        setStepDistM(distToStep)

        // Advance to next step when within 30m of the maneuver point
        if (distToStep < 30 && routeRef.current) {
          const leg = routeRef.current.legs[mode === 'route' ? currentStopIdx : 0]
          if (leg) {
            const stepIdx = leg.steps.findIndex(
              (s) => s.maneuver.location[0] === currentStep.maneuver.location[0] &&
                     s.maneuver.location[1] === currentStep.maneuver.location[1]
            )
            const nextStep = leg.steps[stepIdx + 1]
            if (nextStep) {
              setCurrentStep(nextStep)
              setStepDistM(nextStep.distance)
            }
          }
        }
      }
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setUserPos({ lat, lng })
        const map = mapRef.current
        if (map) {
          const init = () => {
            map.jumpTo({ center: [lng, lat], zoom: 15 })
            loadRoute({ lat, lng })
          }
          if (map.loaded()) init()
          else map.once('load', init)
        }
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 5000 }
    )

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => { if (err.code === err.PERMISSION_DENIED) setGpsDenied(true) },
      { enableHighAccuracy: true, maximumAge: 3000 }
    )

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stops, currentStopIdx, onArrival, onPositionUpdate, loadRoute])
```

### Section F: Re-fetch route when stop advances

```tsx
  // Re-fetch directions when currentStopIdx changes
  useEffect(() => {
    if (userPos) {
      loadRoute(userPos)
    }
    // Reset step to first step of new leg
    setCurrentStep(null)
    setStepDistM(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStopIdx])

  // Load route when destination changes (free-drive)
  useEffect(() => {
    if (mode === 'free-drive' && destination && userPos) {
      loadRoute(userPos)
    }
    if (!destination) {
      // Clear route
      const map = mapRef.current
      if (map?.getSource('route')) {
        map.removeLayer('route-line')
        map.removeSource('route')
      }
      routeRef.current = null
      setCurrentStep(null)
      setStepDistM(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])
```

### Section G: Render

```tsx
  const validStops = stops.filter((s) => s.lat != null && s.lng != null)
  const nextStop = mode === 'route' ? stops[currentStopIdx] : destination ? { name: destination.name } : null

  return (
    <div className="relative w-full h-full">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Turn banner - top center */}
      {currentStep && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 max-w-xs w-full mx-3">
          <div className="shrink-0 text-foreground">
            <ManeuverIcon type={currentStep.maneuver.type} modifier={currentStep.maneuver.modifier} />
          </div>
          <div className="min-w-0">
            <p className="text-foreground font-semibold text-sm leading-tight line-clamp-1">
              {currentStep.maneuver.instruction}
            </p>
            {stepDistM != null && (
              <p className="text-muted-foreground text-xs mt-0.5">{formatDist(stepDistM)} away</p>
            )}
            {nextStop && (
              <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">
                Next: {nextStop.name}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Route error notice */}
      {routeError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-background/90 backdrop-blur-sm rounded-xl shadow px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
          Routing unavailable - showing straight-line path
        </div>
      )}

      {/* GPS denied notice */}
      {gpsDenied && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 bg-background/95 backdrop-blur-sm rounded-xl shadow px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
          GPS unavailable - navigation paused
        </div>
      )}

      {/* Floating stops panel (route mode only) */}
      {mode === 'route' && validStops.length > 0 && (
        <div className="absolute top-20 right-3 z-10 w-48 max-h-72 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-y-auto">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Stops</p>
          </div>
          {stops.map((stop, idx) => {
            const completed = idx < currentStopIdx
            const isCurrent = idx === currentStopIdx
            return (
              <div
                key={stop.id}
                className={`flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 ${
                  isCurrent ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                }`}
              >
                {completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-muted-foreground/50" />
                ) : (
                  <div
                    className="size-5 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: isCurrent ? '#F5A825' : '#1B3A5C' }}
                  >
                    {stop.sequence_order}
                  </div>
                )}
                <span
                  className={`text-xs leading-tight line-clamp-2 ${
                    completed
                      ? 'text-muted-foreground/50 line-through'
                      : isCurrent
                        ? 'font-semibold text-foreground'
                        : 'text-foreground'
                  }`}
                >
                  {stop.name}
                  {stop.lat == null && (
                    <span className="ml-1 text-destructive text-[10px]">(no location)</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Children overlay (scan feedback, end run button, etc.) */}
      {children}
    </div>
  )
}
```

**Step 1:** Write all sections A-G into `navigation-map.tsx`, replacing the placeholder export.

**Step 2:** Build check:
```bash
cd dashboard && npm run build 2>&1 | tail -30
```
Expected: passes. Common issues to watch for:
- GeoJSON type mismatch: use `as GeoJSON.Geometry` cast when passing to `setData`
- `mapboxgl.GeoJSONSource` needs `import type` or cast

**Step 3:** Commit:
```bash
git add dashboard/components/driver/navigation-map.tsx
git commit -m "feat: implement NavigationMap with Directions API, turn banner, and stops panel"
```

---

## Task 4: Redesign ActiveRun to use NavigationMap

**Files:**
- Modify: `dashboard/components/driver/active-run.tsx`

**What to do:**

Rewrite `active-run.tsx` to use `NavigationMap` as the base. The GPS tracking currently in `active-run.tsx` (the `watchPosition` useEffect) moves to `NavigationMap` - use `onPositionUpdate` to post to the API instead.

The new structure:
- `NavigationMap` fills the screen (fullscreen)
- Children passed to `NavigationMap` contain the UI overlays
- `ScanFeedback` overlay stays (it's already fixed-position)
- Header (logo + trip badge) becomes a floating card top-left
- "Arrived" button floats bottom-center
- "End Run" button floats bottom-right
- End run confirmation dialog stays
- Dev buttons preserved

Key changes:
1. Remove the existing GPS `watchPosition` useEffect from `active-run.tsx`; replace `postLocation` call with `onPositionUpdate` prop
2. Read stops with the new unwrapped shape (from Task 1) - already done
3. Map `ActiveRunStop` to `NavigationStop` (they're compatible - just pass stops directly since `ActiveRunStop` has the same fields as `NavigationStop`)
4. `handleNextStop` increments `currentStopIdx` and passes it to `NavigationMap`

New render structure:

```tsx
return (
  <div className="fixed inset-0">
    <ScanFeedback
      feedbackType={feedbackType}
      studentName={feedbackStudentName}
      onDismiss={handleDismissFeedback}
    />

    <NavigationMap
      mode="route"
      stops={stops}
      currentStopIdx={currentStopIdx}
      onArrival={handleNextStop}
      onPositionUpdate={(lat, lng, heading, speed) => postLocation(lat, lng, heading, speed)}
    >
      {/* Floating header */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow px-3 py-2">
        <LogoIcon className="h-6 w-6" />
        <Badge variant="outline" className="font-mono text-xs">
          Trip #{tripId.slice(0, 8)}
        </Badge>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-6 left-0 right-0 z-10 flex items-end justify-center gap-3 px-4">
        {stops.length > 0 && currentStopIdx < stops.length - 1 && (
          <Button
            onClick={handleNextStop}
            size="lg"
            className="flex-1 max-w-xs h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white shadow-lg"
          >
            <ChevronRight className="size-5" />
            Arrived
          </Button>
        )}
        <Button
          onClick={() => setShowConfirmEnd(true)}
          variant="secondary"
          size="icon"
          className="h-14 w-14 rounded-2xl shadow-lg shrink-0"
          title="End Run"
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* Dev buttons */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-24 left-3 z-10 flex flex-col gap-2">
          <Button onClick={simulateScan} variant="outline" size="sm" className="text-xs bg-background/90">
            Simulate Scan
          </Button>
          <Button onClick={handleNextStop} variant="outline" size="sm" className="text-xs bg-background/90">
            Simulate Arrival
          </Button>
        </div>
      )}

      {/* Scan list overlay - bottom sheet style */}
      {scans.length > 0 && (
        <div className="absolute bottom-24 right-3 z-10 w-56 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
          <StudentScanList scans={scans.filter((_, i) => i < 5)} />
        </div>
      )}
    </NavigationMap>

    {/* End run dialog */}
    <Dialog open={showConfirmEnd} onOpenChange={setShowConfirmEnd}>
      ...existing dialog JSX unchanged...
    </Dialog>
  </div>
)
```

Also update imports: add `NavigationMap` import, add `X` from lucide-react. Remove `MapPin` if no longer used.

Remove the `postLocation` useCallback and the GPS `watchPosition` useEffect (lines 57-97 in the original). Replace `postLocation` as a simple inline function or keep as useCallback but call it from `onPositionUpdate`:

```tsx
const postLocation = useCallback(
  (lat: number, lng: number, heading: number | null, speed: number | null) => {
    const now = Date.now()
    if (now - lastPingRef.current < GPS_INTERVAL_MS) return
    lastPingRef.current = now
    const deviceToken = localStorage.getItem('device_token')
    fetch(`${API_BASE}/api/v1/trips/${tripId}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ lat, lng, heading: heading ?? 0, speed: speed ?? 0 }),
    }).catch(() => {})
  },
  [tripId]
)
```

Remove the `useEffect` that called `navigator.geolocation.watchPosition` (it's now in NavigationMap).

**Step 1:** Make all the changes described above.

**Step 2:** Build + lint:
```bash
cd dashboard && npm run lint 2>&1 | tail -20 && npm run build 2>&1 | tail -20
```

**Step 3:** Manual test in dev: open `http://localhost:3000/driver` and verify the pre-trip flow reaches the run page. The map should render and GPS tracking should work.

**Step 4:** Commit:
```bash
git add dashboard/components/driver/active-run.tsx
git commit -m "feat: rebuild ActiveRun with NavigationMap - fullscreen map and floating controls"
```

---

## Task 5: Enhance FreeDriveMap with routing

**Files:**
- Modify: `dashboard/components/driver/free-drive-map.tsx`

**What to do:**

Replace the FreeDriveMap implementation with one that uses `NavigationMap`. The existing functionality (back button, address search, destination pin, locate me) needs to be preserved, but the map itself is now `NavigationMap`.

Key changes:
1. Replace the manual `mapboxgl.Map` initialization with `NavigationMap` in `free-drive` mode
2. Keep the search bar and results UI exactly as-is (they just set `destination` state)
3. Pass `destination` to `NavigationMap` - it handles route drawing and turn banner
4. Remove the manual GPS tracking, marker management, and map setup (NavigationMap handles all that)
5. Keep the "locate me" button - but since NavigationMap handles GPS internally, this button can just scroll the map to user position. Simplest approach: remove the locate button (NavigationMap auto-follows the driver) or keep it as a visual indicator of follow mode. For simplicity, remove it since NavigationMap always follows.
6. Keep the back button

The new component structure:

```tsx
'use client'
import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NavigationMap from '@/components/driver/navigation-map'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface GeocodingFeature {
  id: string
  place_name: string
  center: [number, number]
}

export default function FreeDriveMap() {
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([])
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null)

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,place,poi&limit=5`
      )
      const data = (await res.json()) as { features?: GeocodingFeature[] }
      setSearchResults(data.features ?? [])
    } catch { setSearchResults([]) }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(value), 400)
  }

  const handleSelectResult = (feature: GeocodingFeature) => {
    const [lng, lat] = feature.center
    setDestination({ lat, lng, name: feature.place_name })
    setSearchResults([])
    setSearchQuery(feature.place_name)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setDestination(null)
  }

  return (
    <div className="fixed inset-0">
      <NavigationMap mode="free-drive" destination={destination}>
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-start gap-2">
          <Button
            size="icon" variant="secondary"
            className="shrink-0 h-11 w-11 rounded-full shadow-lg bg-background/95 backdrop-blur-sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 h-11">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Search address or place..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button onClick={clearSearch} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectResult(r)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                  >
                    <span className="line-clamp-1">{r.place_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </NavigationMap>
    </div>
  )
}
```

**Step 1:** Rewrite `free-drive-map.tsx` with the above.

**Step 2:** Build + lint:
```bash
cd dashboard && npm run lint 2>&1 | tail -20 && npm run build 2>&1 | tail -20
```

**Step 3:** Commit:
```bash
git add dashboard/components/driver/free-drive-map.tsx
git commit -m "feat: enhance FreeDriveMap with NavigationMap routing and turn banner"
```

---

## Task 6: Final verification

**Step 1:** Run lint and build together, confirm 0 errors:
```bash
cd dashboard && npm run lint && npm run build
```
Expected: lint exits 0, build completes with no TypeScript errors.

**Step 2:** Manual testing checklist (use Chrome DevTools > Sensors to override GPS):
- [ ] Pre-trip page loads, assignment preview shows correctly
- [ ] Tapping "Start Run" navigates to `/driver/run/[id]`
- [ ] Map renders fullscreen on the run page
- [ ] Floating stops panel appears on right side with correct stop names
- [ ] Current stop highlighted amber, completed greyed
- [ ] Turn banner appears once GPS fix acquired
- [ ] "Arrived" button advances to next stop, stops panel updates
- [ ] Override GPS to stop coordinates (within 50m) - auto-arrival fires
- [ ] Dev "Simulate Arrival" button advances stop
- [ ] "End Run" opens confirmation dialog, completes trip
- [ ] Free-drive map: search works, selecting result shows route line + turn banner
- [ ] Free-drive: clearing search removes route

**Step 3:** If all tests pass, the feature is complete. Run the finishing skill:
```
superpowers:finishing-a-development-branch
```
