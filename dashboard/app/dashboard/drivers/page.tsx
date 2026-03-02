import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import DriverTable from '@/components/dashboard/driver-table'

async function getDrivers() {
  try {
    return await api.drivers.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Drivers — RouteGuard',
}

export default async function DriversPage() {
  const drivers = await getDrivers()

  return (
    <div>
      <DriverTable drivers={drivers} />
    </div>
  )
}
