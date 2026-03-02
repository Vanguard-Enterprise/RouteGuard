import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import RouteTable from '@/components/dashboard/route-table'

async function getRoutes() {
  try {
    return await api.routes.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Routes — RouteGuard',
}

export default async function RoutesPage() {
  const routes = await getRoutes()

  return (
    <div>
      <RouteTable routes={routes} />
    </div>
  )
}
