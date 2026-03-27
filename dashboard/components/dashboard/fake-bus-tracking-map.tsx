"use client"

import { useEffect, useRef, useState } from "react"
import { MapPinIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type FakeBus = {
  id: string
  route: string
  status: "On Time" | "Delayed" | "At Stop" | "Out of Service" | "Emergency"
  lng: number
  lat: number
}

const fakeBuses: FakeBus[] = [
  { id: "BUS-12", route: "North Loop", status: "On Time", lng: -96.828, lat: 32.807 },
  { id: "BUS-21", route: "Riverside", status: "Delayed", lng: -96.792, lat: 32.789 },
  { id: "BUS-07", route: "Oak Ridge", status: "On Time", lng: -96.771, lat: 32.801 },
  { id: "BUS-33", route: "Hillcrest", status: "Out of Service", lng: -96.746, lat: 32.783 },
  { id: "BUS-18", route: "Lakeside", status: "On Time", lng: -96.780, lat: 32.767 },
  { id: "BUS-05", route: "Cedar Run", status: "Emergency", lng: -96.733, lat: 32.816 },
]

function statusColor(status: FakeBus["status"]) {
  if (status === "Emergency") {
    return "#ef4444"
  }

  if (status === "Out of Service") {
    return "#eab308"
  }

  if (status === "Delayed") {
    return "#f59e0b"
  }

  if (status === "At Stop") {
    return "#0ea5e9"
  }

  return "#10b981"
}

export function FakeBusTrackingMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import("mapbox-gl").Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const publicMapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
  // Keep client-side token optional. The proxy route can inject the server token.
  const clientMapToken = publicMapToken && publicMapToken.length > 0
    ? publicMapToken
    : "pk.routeguard.proxy"

  useEffect(() => {
    if (!mapContainerRef.current) return

    let isMounted = true
    let resizeMap: (() => void) | null = null
    let handleResize: (() => void) | null = null

    const initMap = async () => {
      try {
        setMapError(null)
        const mapboxModule = await import("mapbox-gl")
        if (!isMounted || !mapContainerRef.current) return

        const mapboxgl = mapboxModule.default
        mapboxgl.accessToken = clientMapToken

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [-96.797, 32.7767],
          zoom: 11.4,
          pitch: 0,
          bearing: 0,
          attributionControl: false,
          transformRequest: (url) => {
            if (url.includes("/api/mapbox/proxy?url=")) {
              return { url }
            }

            if (url.includes("mapbox.com")) {
              return {
                url: `/api/mapbox/proxy?url=${encodeURIComponent(url)}`,
                credentials: "same-origin",
              }
            }
            return { url }
          },
        })

        mapRef.current = map
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")

        // Ensure WebGL canvas matches container dimensions after layout settles.
        resizeMap = () => {
          if (!isMounted || !mapRef.current) return
          mapRef.current.resize()
        }
        const resizeScheduleMs = [0, 50, 150, 300, 600, 1200]
        requestAnimationFrame(() => {
          if (resizeMap) resizeMap()
        })
        resizeScheduleMs.forEach((delayMs) => {
          setTimeout(() => {
            if (resizeMap) resizeMap()
          }, delayMs)
        })

        handleResize = () => {
          if (resizeMap) resizeMap()
        }

        resizeObserverRef.current = new ResizeObserver(() => {
          if (handleResize) handleResize()
        })
        resizeObserverRef.current.observe(mapContainerRef.current)
        window.addEventListener("resize", handleResize)

        map.on("error", (event) => {
          if (!isMounted || !event.error) return
          setMapError(event.error.message)
        })

        map.on("load", () => {
          // Keep the map anchored to Dallas while still showing all simulated buses.
          map.jumpTo({ center: [-96.797, 32.7767], zoom: 11.4 })

          if (resizeMap) resizeMap()

          map.addSource("bus-points", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: fakeBuses.map((bus) => ({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [bus.lng, bus.lat],
                },
                properties: {
                  id: bus.id,
                  route: bus.route,
                  status: bus.status,
                },
              })),
            },
          })

          map.addLayer({
            id: "bus-points-halo",
            type: "circle",
            source: "bus-points",
            paint: {
              "circle-radius": 12,
              "circle-color": [
                "match",
                ["get", "status"],
                "Emergency",
                "rgba(239, 68, 68, 0.28)",
                "Out of Service",
                "rgba(234, 179, 8, 0.28)",
                "Delayed",
                "rgba(245, 158, 11, 0.28)",
                "At Stop",
                "rgba(14, 165, 233, 0.28)",
                "rgba(16, 185, 129, 0.28)",
              ],
            },
          })

          map.addLayer({
            id: "bus-points-layer",
            type: "circle",
            source: "bus-points",
            paint: {
              "circle-radius": 7,
              "circle-color": [
                "match",
                ["get", "status"],
                "Emergency",
                statusColor("Emergency"),
                "Out of Service",
                statusColor("Out of Service"),
                "Delayed",
                statusColor("Delayed"),
                "At Stop",
                statusColor("At Stop"),
                statusColor("On Time"),
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          })

          map.on("click", "bus-points-layer", (event) => {
            const feature = event.features?.[0]
            if (!feature || feature.geometry.type !== "Point") return
            const coords = feature.geometry.coordinates as [number, number]
            const id = String(feature.properties?.id ?? "Unknown")
            const route = String(feature.properties?.route ?? "Unknown Route")
            const status = String(feature.properties?.status ?? "Unknown")

            new mapboxgl.Popup({
              closeButton: false,
              offset: 14,
              maxWidth: "220px",
            })
              .setLngLat(coords)
              .setHTML(
                `<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; font-size:12px; line-height:1.45;">
                   <div style="font-weight:700;">${id}</div>
                   <div style="color:#334155;">${route}</div>
                   <div style="margin-top:4px; color:#0f172a;">Status: ${status}</div>
                 </div>`
              )
              .addTo(map)
          })

          map.on("mouseenter", "bus-points-layer", () => {
            map.getCanvas().style.cursor = "pointer"
          })
          map.on("mouseleave", "bus-points-layer", () => {
            map.getCanvas().style.cursor = ""
          })
        })
      } catch (error) {
        if (!isMounted) return
        const message = error instanceof Error ? error.message : "Unknown map error"
        setMapError(message)
      }
    }

    void initMap()

    return () => {
      isMounted = false
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
      if (handleResize) window.removeEventListener("resize", handleResize)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [clientMapToken])

  return (
    <div className="px-4 lg:px-6">
      <Card className="@container/card overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinIcon className="size-4 text-primary" />
            Live Bus Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative h-[270px] overflow-hidden rounded-lg border bg-slate-100 sm:h-[340px]">
            <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" aria-label="Live bus tracking map" />

            {mapError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 px-4 text-center text-sm text-slate-600">
                <MapPinIcon className="size-5 text-slate-500" />
                <p>
                  Unable to load map data. Check <code>MAPBOX_TOKEN</code> (or <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>) and
                  <code> /api/mapbox/proxy</code>.
                </p>
              </div>
            ) : null}

            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-slate-900/15 bg-white/90 px-2.5 py-2 text-[11px] text-slate-700 shadow-sm">
              <div className="mb-1.5 font-semibold text-slate-800">Bus Status</div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                On Time
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" />
                Delayed
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-500" />
                At Stop
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-yellow-500" />
                Out of Service
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                Emergency
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <style jsx>{`
        @keyframes busPulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
        }
      `}</style>
    </div>
  )
}
