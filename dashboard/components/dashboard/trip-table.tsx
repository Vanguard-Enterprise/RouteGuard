'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { DataTable, ColumnDef } from '@/components/dashboard/data-table'
import { api, Trip } from '@/lib/api'

interface TripTableProps {
  trips: Trip[]
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

interface NewTripFormProps {
  onCreated: (trip: Trip) => void
  onClose: () => void
}

function NewTripForm({ onCreated, onClose }: NewTripFormProps) {
  const [routeAssignmentId, setRouteAssignmentId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!routeAssignmentId.trim()) {
      setError('Route assignment ID is required.')
      return
    }
    setSaving(true)
    try {
      const trip = await api.trips.create({
        route_assignment_id: routeAssignmentId.trim(),
        date,
        status: 'scheduled',
        notes: notes || null,
      })
      onCreated(trip)
    } catch {
      setError('Failed to create trip.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 max-w-md">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">New Trip</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Route Assignment ID <span className="text-red-500">*</span>
          </label>
          <input
            value={routeAssignmentId}
            onChange={(e) => setRouteAssignmentId(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            placeholder="UUID of route assignment"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none"
            placeholder="Optional notes…"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            {saving ? 'Creating…' : 'Create Trip'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default function TripTable({ trips: initial }: TripTableProps) {
  const router = useRouter()
  const [trips, setTrips] = useState(initial)
  const [showNewForm, setShowNewForm] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? trips.filter(
        (t) =>
          t.date.includes(search) ||
          t.status.toLowerCase().includes(search.toLowerCase()) ||
          t.route_assignment_id.toLowerCase().includes(search.toLowerCase()),
      )
    : trips

  const columns: ColumnDef<Trip>[] = [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (row) => (
        <Link
          href={`/dashboard/trips/${row.id}`}
          className="font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {row.date}
        </Link>
      ),
    },
    {
      key: 'route_assignment_id',
      header: 'Assignment',
      render: (row) => (
        <span className="font-mono text-xs text-gray-600">{row.route_assignment_id.slice(0, 8)}…</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'started_at',
      header: 'Started At',
      render: (row) =>
        row.started_at ? new Date(row.started_at).toLocaleString() : '—',
    },
    {
      key: 'completed_at',
      header: 'Completed At',
      render: (row) =>
        row.completed_at ? new Date(row.completed_at).toLocaleString() : '—',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Trips
        </h2>
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          New Trip
        </button>
      </div>

      {showNewForm && (
        <NewTripForm
          onCreated={(trip) => {
            setTrips((prev) => [trip, ...prev])
            setShowNewForm(false)
            router.refresh()
          }}
          onClose={() => setShowNewForm(false)}
        />
      )}

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search trips…"
        onSearch={setSearch}
        searchValue={search}
      />
    </div>
  )
}
