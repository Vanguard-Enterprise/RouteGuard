import { api, APIError, RouteAssignment, Stop } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import TripDetailMap from '@/components/dashboard/trip-detail-map'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getTrip(id: string) {
  try {
    return await api.trips.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

async function getStopsForAssignment(routeAssignmentId: string): Promise<Stop[]> {
  try {
    const routes = await api.routes.list()
    // Fetch all assignments in parallel
    const results = await Promise.all(
      routes.map((route) =>
        api.routes.assignments.list(route.id)
          .then((assignments) => ({ route, assignments }))
          .catch(() => ({ route, assignments: [] as RouteAssignment[] }))
      )
    )
    const match = results.find(({ assignments }) =>
      assignments.some((a) => a.id === routeAssignmentId)
    )
    if (!match) return []
    return await api.routes.stops.list(match.route.id)
  } catch {
    return []
  }
}

export default async function TripDetailPage({ params }: PageProps) {
  const { id } = await params
  const trip = await getTrip(id)
  if (!trip) notFound()

  const stops = await getStopsForAssignment(trip.route_assignment_id)

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/trips"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Trip — {trip.date}
        </h1>
      </div>

      <TripDetailMap
        trip={trip}
        stops={stops.map((s) => ({ name: s.name, scheduled_time: s.scheduled_time }))}
      />
    </div>
  )
}
