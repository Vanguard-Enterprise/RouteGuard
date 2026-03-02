import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import VehicleTable from '@/components/dashboard/vehicle-table'

async function getVehicles() {
  try {
    return await api.vehicles.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Vehicles — RouteGuard',
}

export default async function VehiclesPage() {
  const vehicles = await getVehicles()

  return (
    <div>
      <VehicleTable vehicles={vehicles} />
    </div>
  )
}
