import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import TripTable from '@/components/dashboard/trip-table'

async function getTrips() {
  try {
    return await api.trips.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Trips — RouteGuard',
}

export default async function TripsPage() {
  const trips = await getTrips()

  return (
    <div>
      <TripTable trips={trips} />
    </div>
  )
}
