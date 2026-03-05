'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  ArrowUp, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight,
  Flag, RotateCcw, CheckCircle2,
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

export default function NavigationMap({
  mode,
  stops = [],
  currentStopIdx = 0,
  onArrival,
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

  // Init map
  useEffect(() => {
    if (!containerRef.current) return
    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
      console.error('NavigationMap: WebGL not supported')
      return
    }
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5, 39.5],
      zoom: 4,
      pitchWithRotate: false,
      failIfMajorPerformanceCaveat: false,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawRouteGeometry(
    map: mapboxgl.Map,
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  ) {
    if (map.getSource('route')) {
      (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geometry as unknown as GeoJSON.Geometry)
    } else {
      map.addSource('route', { type: 'geojson', data: geometry as unknown as GeoJSON.Geometry })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#1B3A5C',
          'line-width': 5,
        },
      })
    }
  }

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
        drawRouteGeometry(map, { type: 'LineString', coordinates: waypoints })
        return
      }

      setRouteError(false)
      routeRef.current = route
      drawRouteGeometry(map, route.geometry)

      const firstStep = route.legs[0]?.steps[0]
      if (firstStep) {
        setCurrentStep(firstStep)
        setStepDistM(firstStep.distance)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, currentStopIdx, destination, mode]
  )

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

  // GPS tracking and arrival detection
  useEffect(() => {
    if (!navigator.geolocation) return

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, heading, speed } = pos.coords
      setUserPos({ lat, lng })
      onPositionUpdate?.(lat, lng, heading, speed)

      const map = mapRef.current

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

      // Off-route detection
      const last = lastRouteCheckRef.current
      if (last && routeRef.current) {
        const moved = haversineMeters(lat, lng, last.lat, last.lng)
        if (moved > REROUTE_DEVIATION_M) {
          lastRouteCheckRef.current = { lat, lng }
          const routeCoords = routeRef.current.geometry.coordinates
          const minDist = routeCoords.reduce(
            (min, [rLng, rLat]) => Math.min(min, haversineMeters(lat, lng, rLat, rLng)),
            Infinity
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

  // Re-fetch directions when currentStopIdx changes
  useEffect(() => {
    if (userPos) {
      loadRoute(userPos)
    }
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

      {/* Children overlay */}
      {children}
    </div>
  )
}
