import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import RouteBuilder from '@/components/dashboard/route-builder'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getRoute(id: string) {
  try {
    return await api.routes.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

async function getStops(id: string) {
  try {
    return await api.routes.stops.list(id)
  } catch {
    return []
  }
}

async function getAssignments(id: string) {
  try {
    return await api.routes.assignments.list(id)
  } catch {
    return []
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    archived: 'bg-gray-100 text-gray-500',
  }
  const cls = styles[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}

export default async function RouteDetailPage({ params }: PageProps) {
  const { id } = await params
  const [route, stops, assignments] = await Promise.all([
    getRoute(id),
    getStops(id),
    getAssignments(id),
  ])
  if (!route) notFound()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/routes"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {route.name}
          </h1>
          <StatusBadge status={route.status} />
        </div>
        <Link
          href={`/dashboard/routes/${route.id}/edit`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Route Info</h2>
          <dl className="space-y-2">
            {[
              { label: 'Type', value: <span className="capitalize">{route.type}</span> },
              { label: 'Status', value: <StatusBadge status={route.status} /> },
              {
                label: 'Est. Duration',
                value: route.estimated_duration_min != null
                  ? `${route.estimated_duration_min} min`
                  : '—',
              },
              { label: 'Description', value: route.description ?? '—' },
              { label: 'Created', value: new Date(route.created_at).toLocaleString() },
              { label: 'Updated', value: new Date(route.updated_at).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4">
                <dt className="w-28 text-sm text-gray-500 shrink-0">{label}</dt>
                <dd className="text-sm text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Assignments ({assignments.length})
          </h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-gray-400">No assignments for this route.</p>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li key={a.id} className="text-sm border border-gray-100 rounded-lg px-3 py-2">
                  <p className="font-medium text-gray-800">
                    {a.effective_date ?? 'No start'} – {a.end_date ?? 'Ongoing'}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">Days: {a.days_of_week}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <RouteBuilder routeId={route.id} initialStops={stops} />
    </div>
  )
}
