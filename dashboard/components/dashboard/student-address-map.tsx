'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface StudentAddressMapProps {
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

export default function StudentAddressMap({ address, city, state, zip }: StudentAddressMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [coords, setCoords] = useState<[number, number] | null>(null)

  const fullAddress = [address, city, state, zip].filter(Boolean).join(', ')

  useEffect(() => {
    if (!fullAddress) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${token}&limit=1`,
    )
      .then((r) => r.json())
      .then((data) => {
        const feature = data.features?.[0]
        if (feature) {
          setCoords([feature.geometry.coordinates[0], feature.geometry.coordinates[1]])
        }
      })
      .catch(() => {})
  }, [fullAddress])

  useEffect(() => {
    if (!coords || !containerRef.current) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: coords,
      zoom: 14,
    })
    new mapboxgl.Marker().setLngLat(coords).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [coords])

  if (!fullAddress) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50">
        <span className="text-sm font-medium text-gray-700">Location</span>
      </div>
      <div ref={containerRef} className="w-full h-48" />
    </div>
  )
}
