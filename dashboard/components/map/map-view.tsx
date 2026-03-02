'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Stop } from '@/lib/api'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface MapViewProps {
  stops?: Stop[]
  center?: [number, number]
  zoom?: number
  className?: string
}

export default function MapView({
  stops = [],
  center = [-98.5, 39.5],
  zoom = 4,
  className = '',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const validStops = stops.filter((s) => s.lat != null && s.lng != null)
    if (validStops.length === 0) return

    validStops.forEach((stop) => {
      const el = document.createElement('div')
      el.style.cssText = [
        'width:28px',
        'height:28px',
        'border-radius:50%',
        'background:var(--color-brand-navy,#1e3a5f)',
        'color:#fff',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-size:12px',
        'font-weight:700',
        'border:2px solid #fff',
        'box-shadow:0 1px 4px rgba(0,0,0,0.3)',
        'cursor:default',
      ].join(';')
      el.textContent = String(stop.sequence_order)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([stop.lng as number, stop.lat as number])
        .setPopup(
          new mapboxgl.Popup({ offset: 18 }).setHTML(
            `<strong>${stop.name}</strong>${stop.address ? `<br/>${stop.address}` : ''}`,
          ),
        )
        .addTo(map)

      markersRef.current.push(marker)
    })

    if (validStops.length === 1) {
      map.flyTo({ center: [validStops[0].lng as number, validStops[0].lat as number], zoom: 13 })
    } else {
      const bounds = new mapboxgl.LngLatBounds()
      validStops.forEach((s) => bounds.extend([s.lng as number, s.lat as number]))
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 })
    }
  }, [stops])

  return <div ref={containerRef} className={`w-full h-full ${className}`} />
}
