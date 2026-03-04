import { redirect } from 'next/navigation'
import { api, APIError } from '@/lib/api'
import { Bus, GraduationCap, Route, School, Truck, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Overview - RouteGuard',
}

async function fetchCounts() {
  const safe = async <T,>(fn: () => Promise<T[]>): Promise<number> => {
    try {
      const items = await fn()
      return items.length
    } catch (err) {
      if (err instanceof APIError && err.status === 401) redirect('/staff/login')
      return 0
    }
  }

  const [routes, students, drivers, vehicles, schools] = await Promise.all([
    safe(api.routes.list),
    safe(api.students.list),
    safe(api.drivers.list),
    safe(api.vehicles.list),
    safe(api.schools.list),
  ])

  return { routes, students, drivers, vehicles, schools }
}

export default async function DashboardOverviewPage() {
  const counts = await fetchCounts()

  const stats = [
    { label: 'Routes', value: counts.routes, icon: Route, href: '/dashboard/routes' },
    { label: 'Students', value: counts.students, icon: GraduationCap, href: '/dashboard/students' },
    { label: 'Drivers', value: counts.drivers, icon: UserCheck, href: '/dashboard/drivers' },
    { label: 'Vehicles', value: counts.vehicles, icon: Truck, href: '/dashboard/vehicles' },
    { label: 'Schools', value: counts.schools, icon: School, href: '/dashboard/schools' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <a key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
