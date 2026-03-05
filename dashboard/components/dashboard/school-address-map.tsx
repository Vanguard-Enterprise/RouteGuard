'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface SchoolAddressMapProps {
  lat: number
  lng: number
}

export default function SchoolAddressMap({ lat, lng }: SchoolAddressMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 14,
    })
    new mapboxgl.Marker().setLngLat([lng, lat]).addTo(map)
    return () => map.remove()
  }, [lat, lng])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50">
        <span className="text-sm font-medium text-gray-700">Location</span>
      </div>
      <div ref={containerRef} className="w-full h-48" />
    </div>
  )
}
