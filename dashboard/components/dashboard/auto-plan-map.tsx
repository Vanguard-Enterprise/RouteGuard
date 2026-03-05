'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { type AutoPlanResponse } from '@/lib/api'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

// Distinct colors for up to 10 buses
const BUS_COLORS = [
  '#1B3A5C', '#F5A825', '#2A7D4F', '#E53E3E', '#805AD5',
  '#2B6CB0', '#C05621', '#285E61', '#702459', '#276749',
]

interface AutoPlanMapProps {
  plan: AutoPlanResponse
  onConfirm: (plan: AutoPlanResponse) => void
  onBack: () => void
  confirming: boolean
}

export default function AutoPlanMap({ plan: initialPlan, onConfirm, onBack, confirming }: AutoPlanMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [plan] = useState<AutoPlanResponse>(initialPlan)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      zoom: 10,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => map.remove()
  }, [])

  // Render markers whenever plan changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function renderMarkers() {
      // Clear existing markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      const bounds = new mapboxgl.LngLatBounds()

      plan.buses.forEach((bus, busIdx) => {
        const color = BUS_COLORS[busIdx % BUS_COLORS.length]
        bus.stops.forEach((stop) => {
          const el = document.createElement('div')
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;cursor:pointer`
          el.textContent = String(stop.order)

          const label = bus.vehicle_number ? `Bus ${bus.vehicle_number}` : 'Bus'
          const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
            `<div style="font-size:12px"><strong>${label} - Stop ${stop.order}</strong><br/>${stop.address ?? ''}<br/>${stop.student_ids.length} student(s)</div>`,
          )

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([stop.lng, stop.lat])
            .setPopup(popup)
            .addTo(map!)
          markersRef.current.push(marker)
          bounds.extend([stop.lng, stop.lat])
        })
      })

      // School pin
      if (plan.school_lat && plan.school_lng) {
        const el = document.createElement('div')
        el.style.cssText = 'width:32px;height:32px;border-radius:4px;background:#1B3A5C;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;cursor:pointer'
        el.textContent = '🏫'
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([plan.school_lng, plan.school_lat])
          .addTo(map!)
        if (plan.school_name) {
          marker.setPopup(new mapboxgl.Popup({ offset: 25 }).setText(plan.school_name))
        }
        markersRef.current.push(marker)
        bounds.extend([plan.school_lng, plan.school_lat])
      }

      if (!bounds.isEmpty()) {
        map!.fitBounds(bounds, { padding: 60 })
      }
    }

    if (map.isStyleLoaded()) {
      renderMarkers()
    } else {
      map.once('load', renderMarkers)
    }
  }, [plan])

  const totalStudents = plan.buses.reduce(
    (sum, b) => sum + b.stops.reduce((s, stop) => s + stop.student_ids.length, 0),
    0,
  )

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Sidebar */}
      <div className="w-72 shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
        {plan.school_name && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 text-sm text-gray-600">
            <span>🏫</span>
            <span>{plan.school_name}</span>
          </div>
        )}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">
            {plan.buses.length} bus{plan.buses.length !== 1 ? 'es' : ''} - {totalStudents} students
          </p>
          {plan.unassigned_students.length > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">
              {plan.unassigned_students.length} students could not be assigned (capacity exceeded)
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {plan.buses.map((bus, idx) => {
            const color = BUS_COLORS[idx % BUS_COLORS.length]
            const studentCount = bus.stops.reduce((s, stop) => s + stop.student_ids.length, 0)
            return (
              <div key={bus.vehicle_id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-medium text-gray-800">
                    {bus.vehicle_number ? `Bus ${bus.vehicle_number}` : 'Bus'}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{studentCount} students</span>
                </div>
                <ol className="space-y-1 ml-5">
                  {bus.stops.map((stop) => (
                    <li key={stop.order} className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Stop {stop.order}</span>
                      {stop.address && ` - ${stop.address}`}
                      <span className="text-gray-400"> ({stop.student_ids.length})</span>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={() => onConfirm(plan)}
            disabled={confirming}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            {confirming ? 'Creating...' : 'Confirm Plan'}
          </button>
          <button
            onClick={onBack}
            disabled={confirming}
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 rounded-xl overflow-hidden border border-gray-200" />
    </div>
  )
}
