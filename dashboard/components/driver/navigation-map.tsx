'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ArrowUp, ArrowLeft, ArrowRight, ArrowUpLeft, ArrowUpRight,
  Flag, RotateCcw, CheckCircle2,
} from 'lucide-react'

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
  stops?: NavigationStop[]
  currentStopIdx?: number
  onArrival?: () => void
  onManualAdvance?: () => void
  destination?: { lat: number; lng: number; name: string } | null
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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDist(meters: number): string {
  const feet = meters * 3.281
  if (feet < 1000) return `${Math.max(50, Math.round(feet / 50) * 50)} ft`
  return `${(meters / 1609.34).toFixed(1)} mi`
}

function ManeuverIcon({ type, modifier }: { type: string; modifier?: string }) {
  if (type === 'arrive') return <Flag className="size-7" />
  if (type === 'roundabout' || type === 'rotary') return <RotateCcw className="size-7" />
  if (
    type === 'turn' || type === 'end of road' || type === 'fork' ||
    type === 'merge' || type === 'on ramp' || type === 'off ramp'
  ) {
    if (modifier?.includes('slight left')) return <ArrowUpLeft className="size-7" />
    if (modifier?.includes('slight right')) return <ArrowUpRight className="size-7" />
    if (modifier?.includes('left')) return <ArrowLeft className="size-7" />
    if (modifier?.includes('right')) return <ArrowRight className="size-7" />
  }
  return <ArrowUp className="size-7" />
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driverMarkerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeLayerRef = useRef<any>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastArrivalRef = useRef<number>(0)
  const lastRouteCheckRef = useRef<{ lat: number; lng: number } | null>(null)
  const routeRef = useRef<DirectionsRoute | null>(null)

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [currentStep, setCurrentStep] = useState<DirectionsStep | null>(null)
  const [stepDistM, setStepDistM] = useState<number | null>(null)
  const [routeError, setRouteError] = useState(false)
  const [gpsDenied, setGpsDenied] = useState(false)

  // Init Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Dynamically import leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        center: [39.5, -98.5],
        zoom: 4,
        zoomControl: true,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])


  const drawRoute = useCallback((coords: [number, number][]) => {
    import('leaflet').then((L) => {
      const map = mapRef.current
      if (!map) return
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current)
      }
      // coords are [lng, lat] from Mapbox - swap to [lat, lng] for Leaflet
      const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number])
      routeLayerRef.current = L.polyline(latlngs, { color: '#1B3A5C', weight: 5 }).addTo(map)
    })
  }, [])

  const loadRoute = useCallback(
    async (fromPos?: { lat: number; lng: number }) => {
      const map = mapRef.current
      if (!map) return

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
        drawRoute(waypoints)
        return
      }

      setRouteError(false)
      routeRef.current = route
      drawRoute(route.geometry.coordinates)

      const firstStep = route.legs[0]?.steps[0]
      if (firstStep) {
        setCurrentStep(firstStep)
        setStepDistM(firstStep.distance)
      }
    },
    [stops, currentStopIdx, destination, mode, drawRoute]
  )

  // Draw stop markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    import('leaflet').then((L) => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      stops.forEach((stop, idx) => {
        if (stop.lat == null || stop.lng == null) return

        const completed = idx < currentStopIdx
        const isCurrent = idx === currentStopIdx
        const color = isCurrent ? '#F5A825' : completed ? '#9ca3af' : '#1B3A5C'

        const icon = L.divIcon({
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${stop.sequence_order}</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([stop.lat, stop.lng], { icon })
          .bindPopup(`<strong>${stop.name}</strong>${stop.address ? `<br/>${stop.address}` : ''}`)
          .addTo(map)
        markersRef.current.push(marker)
      })
    })
  }, [stops, currentStopIdx])

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, heading, speed } = pos.coords
      setUserPos({ lat, lng })
      onPositionUpdate?.(lat, lng, heading, speed)

      const map = mapRef.current
      if (map) {
        import('leaflet').then((L) => {
          if (driverMarkerRef.current) {
            driverMarkerRef.current.setLatLng([lat, lng])
          } else {
            const icon = L.divIcon({
              html: `<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.25)"></div>`,
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })
            driverMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map)
          }
          const zoom = map.getZoom()
          map.panTo([lat, lng])
          if (zoom < 15) map.setZoom(15)
        })
      }

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
          map.setView([lat, lng], 15)
          loadRoute({ lat, lng })
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
    if (userPos) loadRoute(userPos)
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
      if (routeLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(routeLayerRef.current)
        routeLayerRef.current = null
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
      <div ref={containerRef} className="absolute inset-0" />

      {currentStep && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 max-w-xs w-full mx-3">
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
              <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">Next: {nextStop.name}</p>
            )}
          </div>
        </div>
      )}

      {routeError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur-sm rounded-xl shadow px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
          Routing unavailable - showing straight-line path
        </div>
      )}

      {gpsDenied && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1000] bg-background/95 backdrop-blur-sm rounded-xl shadow px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
          GPS unavailable - navigation paused
        </div>
      )}

      {mode === 'route' && validStops.length > 0 && (
        <div className="absolute top-20 right-3 z-[1000] w-48 max-h-72 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-y-auto">
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

      {children}
    </div>
  )
}
