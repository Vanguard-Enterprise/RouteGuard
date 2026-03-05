'use client'

import { useState } from 'react'
import MapView from '@/components/map/map-view'
import type { Trip, Stop } from '@/lib/api'
import { useTripStream } from '@/hooks/use-trip-stream'
import DriverAssignment from '@/components/dashboard/driver-assignment'

export interface StopRow {
  id: string
  name: string
  scheduled_time: string | null
}

interface TripDetailMapProps {
  trip: Trip
  stops?: StopRow[]
  orgId: string
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  const cls = styles[status] ?? 'bg-gray-100 text-gray-600'
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default function TripDetailMap({ trip: initialTrip, stops = [], orgId }: TripDetailMapProps) {
  const [trip, setTrip] = useState(initialTrip)
  const { locations, scans } = useTripStream(orgId)
  const busLocation = locations[trip.id]

  const boardedNames: Record<string, string[]> = {}
  const exitedNames: Record<string, string[]> = {}
  scans.forEach((s) => {
    if (s.scan_type === 'board') {
      boardedNames[s.stop_id] = [...(boardedNames[s.stop_id] ?? []), s.student_name]
    } else {
      exitedNames[s.stop_id] = [...(exitedNames[s.stop_id] ?? []), s.student_name]
    }
  })

  const mapStops: Stop[] = []

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Trip Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="text-sm text-gray-900 mt-0.5"><StatusBadge status={trip.status} /></dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Date</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.date}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Route</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.route_name ?? '—'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Bus</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.vehicle_number ? `Bus ${trip.vehicle_number}` : '—'}</dd>
          </div>
          {trip.school_name && (
            <div className="flex flex-col">
              <dt className="text-xs text-gray-500">School</dt>
              <dd className="text-sm text-gray-900 mt-0.5">{trip.school_name}</dd>
            </div>
          )}
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Started At</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.started_at ? new Date(trip.started_at).toLocaleString() : '—'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-gray-500">Completed At</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{trip.completed_at ? new Date(trip.completed_at).toLocaleString() : '—'}</dd>
          </div>
          {trip.notes && (
            <div className="flex flex-col col-span-2">
              <dt className="text-xs text-gray-500">Notes</dt>
              <dd className="text-sm text-gray-900 mt-0.5">{trip.notes}</dd>
            </div>
          )}
          <div className="flex flex-col col-span-2">
            <DriverAssignment trip={trip} onUpdated={setTrip} />
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="relative h-80">
          <MapView
            stops={mapStops}
            busPosition={busLocation ? { lat: busLocation.lat, lng: busLocation.lng } : undefined}
          />
          {!busLocation && (
            <div className="absolute top-3 right-3 pointer-events-none">
              <span className="bg-white/90 border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-500 shadow-sm">
                Awaiting GPS signal...
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Stops</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-8">#</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Stop</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Boarded</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Exited</th>
            </tr>
          </thead>
          <tbody>
            {stops.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-sm">
                  No stops data available for this trip.
                </td>
              </tr>
            ) : (
              stops.map((stop, idx) => (
                <tr key={stop.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-gray-800">{stop.name}</td>
                  <td className="px-5 py-2.5 text-gray-600 text-xs">
                    {(boardedNames[stop.id] ?? []).length === 0
                      ? <span className="text-gray-300">—</span>
                      : boardedNames[stop.id].join(', ')}
                  </td>
                  <td className="px-5 py-2.5 text-gray-600 text-xs">
                    {(exitedNames[stop.id] ?? []).length === 0
                      ? <span className="text-gray-300">—</span>
                      : exitedNames[stop.id].join(', ')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
