'use client'

import { useState, useEffect } from 'react'
import { api, Driver, Trip } from '@/lib/api'

interface DriverAssignmentProps {
  trip: Trip
  onUpdated: (trip: Trip) => void
}

export default function DriverAssignment({ trip, onUpdated }: DriverAssignmentProps) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.drivers.list().then(setDrivers).catch(() => {})
  }, [])

  async function handleChange(driverId: string) {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.trips.updateAssignment(trip.id, driverId || null)
      onUpdated(updated)
    } catch {
      setError('Failed to assign driver.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Driver</label>
      {error && <p className="text-xs text-red-500 mb-1">{error}</p>}
      <select
        value={trip.driver_id ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.first_name} {d.last_name}
          </option>
        ))}
      </select>
      {saving && <p className="text-xs text-gray-400 mt-1">Saving...</p>}
    </div>
  )
}
