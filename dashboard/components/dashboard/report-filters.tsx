'use client'

import { useState, useEffect } from 'react'
import { api, Route } from '@/lib/api'

interface FilterParams {
  start_date: string
  end_date: string
  route_id?: string
}

interface ReportFiltersProps {
  onFilter: (params: FilterParams) => void
}

export default function ReportFilters({ onFilter }: ReportFiltersProps) {
  const [startDate, setStartDate] = useState(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [routeId, setRouteId] = useState('')
  const [routes, setRoutes] = useState<Route[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(true)

  useEffect(() => {
    api.routes
      .list()
      .then(setRoutes)
      .catch(() => {})
      .finally(() => setLoadingRoutes(false))
  }, [])

  function handleApply() {
    const params: FilterParams = {
      start_date: startDate,
      end_date: endDate,
    }
    if (routeId) params.route_id = routeId
    onFilter(params)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 mb-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Route</label>
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            disabled={loadingRoutes}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white disabled:opacity-60"
          >
            <option value="">All Routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleApply}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
