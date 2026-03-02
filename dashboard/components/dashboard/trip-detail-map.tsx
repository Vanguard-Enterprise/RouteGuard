'use client'

import MapView from '@/components/map/map-view'
import type { Trip, Stop } from '@/lib/api'
import { useTripStream } from '@/hooks/use-trip-stream'

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

export default function TripDetailMap({ trip, stops = [], orgId }: TripDetailMapProps) {
  const { locations, scans } = useTripStream(orgId)
  const busLocation = locations[trip.id]

  // Build scan counts keyed by stop_id
  const boardCounts: Record<string, number> = {}
  const exitCounts: Record<string, number> = {}
  scans.forEach((s) => {
    if (s.scan_type === 'board') {
      boardCounts[s.stop_id] = (boardCounts[s.stop_id] ?? 0) + 1
    } else {
      exitCounts[s.stop_id] = (exitCounts[s.stop_id] ?? 0) + 1
    }
  })

  // Convert StopRow[] to the Stop[] shape MapView expects (only needs lat/lng/sequence_order/name/address)
  // We pass an empty array here since StopRow doesn't carry coordinates — the full Stop[] is on the page
  // The parent page should pass stops as Stop[] if available; for now we pass [] to satisfy types.
  const mapStops: Stop[] = []

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Trip Metadata</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            { label: 'Status', value: <StatusBadge status={trip.status} /> },
            { label: 'Date', value: trip.date },
            { label: 'Started At', value: trip.started_at ? new Date(trip.started_at).toLocaleString() : '—' },
            { label: 'Completed At', value: trip.completed_at ? new Date(trip.completed_at).toLocaleString() : '—' },
            { label: 'Notes', value: trip.notes ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
            </div>
          ))}
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
                Awaiting GPS signal…
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
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Stop Name</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Scheduled Time</th>
              <th className="text-right px-5 py-2 text-xs font-medium text-gray-500">Board Count</th>
              <th className="text-right px-5 py-2 text-xs font-medium text-gray-500">Exit Count</th>
            </tr>
          </thead>
          <tbody>
            {stops.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                  No stops data available for this trip.
                </td>
              </tr>
            ) : (
              stops.map((stop, idx) => (
                <tr key={stop.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-gray-800">{stop.name}</td>
                  <td className="px-5 py-2.5 text-gray-600">{stop.scheduled_time ?? '—'}</td>
                  <td className="px-5 py-2.5 text-right text-gray-600">{boardCounts[stop.id] ?? 0}</td>
                  <td className="px-5 py-2.5 text-right text-gray-600">{exitCounts[stop.id] ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
