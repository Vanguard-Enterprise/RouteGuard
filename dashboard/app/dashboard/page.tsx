import { redirect } from 'next/navigation'
import Link from 'next/link'
import { type LucideIcon, Route, GraduationCap, School, Truck, UserCheck, Bus } from 'lucide-react'
import { api, APIError, type Trip } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PersonaViewSwitcher,
  type Persona,
} from '@/components/dashboard/persona-view-switcher'

export const metadata = {
  title: 'Overview - RouteGuard',
}

export const dynamic = 'force-dynamic'

// ----------------------------------------------------------------
// Persona detection
// ----------------------------------------------------------------

function detectPersona(permissions: string[]): Persona {
  const has = (p: string) => permissions.includes(p)
  if (has('org:manage')) return 'admin'
  if (has('routes:write') && has('students:write')) return 'routing_specialist'
  if (has('trips:write') && !has('routes:write')) return 'dispatcher'
  if (has('vehicles:write') && !has('trips:write') && !has('routes:write')) return 'fleet_manager'
  return 'school_admin'
}

const VALID_PERSONAS = new Set<string>([
  'admin',
  'school_admin',
  'dispatcher',
  'routing_specialist',
  'fleet_manager',
])

// ----------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------

async function safeCount(fn: () => Promise<unknown[]>): Promise<number> {
  try {
    return (await fn()).length
  } catch (err) {
    if (err instanceof APIError && err.status === 401) redirect('/staff/login')
    return 0
  }
}

async function safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) redirect('/staff/login')
    return []
  }
}

// ----------------------------------------------------------------
// Sub-components (server-safe, no 'use client')
// ----------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string
  value: number
  icon: LucideIcon
  href: string
}) {
  return (
    <a href={href}>
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
  )
}

function QuickLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 mt-2">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {label} -&gt;
        </Link>
      ))}
    </div>
  )
}

function TripStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
  }
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <Link
      href={`/dashboard/trips/${trip.id}`}
      className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
    >
      <span className="text-sm font-medium text-gray-700">{trip.date}</span>
      <span className="font-mono text-xs text-gray-500">
        {trip.route_assignment_id.slice(0, 8)}...
      </span>
      <TripStatusBadge status={trip.status} />
    </Link>
  )
}

function PageHeader({
  isAdmin,
  persona,
  natural,
}: {
  isAdmin: boolean
  persona: Persona
  natural: Persona
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      {isAdmin && <PersonaViewSwitcher current={persona} natural={natural} />}
    </div>
  )
}

// ----------------------------------------------------------------
// Page
// ----------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string>>
}

export default async function DashboardOverviewPage({ searchParams }: PageProps) {
  const user = await getServerUser()
  if (!user) redirect('/staff/login')

  const params = await searchParams
  const natural = detectPersona(user.permissions)
  const isAdmin = user.permissions.includes('org:manage')
  const requested = params.view
  const persona: Persona =
    isAdmin && requested && VALID_PERSONAS.has(requested)
      ? (requested as Persona)
      : natural

  const today = new Date().toISOString().slice(0, 10)

  // ---- Admin ----
  if (persona === 'admin') {
    const [routes, students, drivers, vehicles, schools] = await Promise.all([
      safeCount(api.routes.list),
      safeCount(api.students.list),
      safeCount(api.drivers.list),
      safeCount(api.vehicles.list),
      safeCount(api.schools.list),
    ])
    return (
      <div>
        <PageHeader isAdmin={isAdmin} persona={persona} natural={natural} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Routes" value={routes} icon={Route} href="/dashboard/routes" />
          <StatCard label="Students" value={students} icon={GraduationCap} href="/dashboard/students" />
          <StatCard label="Drivers" value={drivers} icon={UserCheck} href="/dashboard/drivers" />
          <StatCard label="Vehicles" value={vehicles} icon={Truck} href="/dashboard/vehicles" />
          <StatCard label="Schools" value={schools} icon={School} href="/dashboard/schools" />
        </div>
      </div>
    )
  }

  // ---- Dispatcher ----
  if (persona === 'dispatcher') {
    const trips = await safeList(api.trips.list)
    const todayTrips = trips.filter((t) => t.date === today)
    const activeCount = todayTrips.filter((t) => t.status === 'in_progress').length
    const scheduledCount = todayTrips.filter((t) => t.status === 'scheduled').length

    return (
      <div>
        <PageHeader isAdmin={isAdmin} persona={persona} natural={natural} />
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard label="Active Trips" value={activeCount} icon={Bus} href="/dashboard/trips" />
          <StatCard label="Scheduled Today" value={scheduledCount} icon={Bus} href="/dashboard/trips" />
        </div>
        {todayTrips.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Today&apos;s Trips</p>
            </div>
            <div className="divide-y divide-gray-50">
              {todayTrips.slice(0, 5).map((trip) => (
                <TripRow key={trip.id} trip={trip} />
              ))}
            </div>
          </div>
        )}
        <QuickLinks links={[{ href: '/dashboard/trips', label: 'All Trips' }]} />
      </div>
    )
  }

  // ---- School Admin ----
  if (persona === 'school_admin') {
    const [trips, students] = await Promise.all([
      safeList(api.trips.list),
      safeCount(api.students.list),
    ])
    const todayTrips = trips.filter((t) => t.date === today)
    const activeCount = todayTrips.filter((t) => t.status === 'in_progress').length

    return (
      <div>
        <PageHeader isAdmin={isAdmin} persona={persona} natural={natural} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Active Trips" value={activeCount} icon={Bus} href="/dashboard/trips" />
          <StatCard label="Today's Trips" value={todayTrips.length} icon={Bus} href="/dashboard/trips" />
          <StatCard label="Students" value={students} icon={GraduationCap} href="/dashboard/students" />
        </div>
        <QuickLinks
          links={[
            { href: '/dashboard/trips', label: 'Trips' },
            { href: '/dashboard/students', label: 'Students' },
            { href: '/dashboard/reports', label: 'Reports' },
          ]}
        />
      </div>
    )
  }

  // ---- Routing Specialist ----
  if (persona === 'routing_specialist') {
    const [routes, students, schools] = await Promise.all([
      safeCount(api.routes.list),
      safeCount(api.students.list),
      safeCount(api.schools.list),
    ])

    return (
      <div>
        <PageHeader isAdmin={isAdmin} persona={persona} natural={natural} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Routes" value={routes} icon={Route} href="/dashboard/routes" />
          <StatCard label="Students" value={students} icon={GraduationCap} href="/dashboard/students" />
          <StatCard label="Schools" value={schools} icon={School} href="/dashboard/schools" />
        </div>
        <QuickLinks
          links={[
            { href: '/dashboard/routes', label: 'Routes' },
            { href: '/dashboard/students', label: 'Students' },
            { href: '/dashboard/schools', label: 'Schools' },
          ]}
        />
      </div>
    )
  }

  // ---- Fleet Manager ----
  const [vehicles, drivers] = await Promise.all([
    safeCount(api.vehicles.list),
    safeCount(api.drivers.list),
  ])

  return (
    <div>
      <PageHeader isAdmin={isAdmin} persona={persona} natural={natural} />
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Vehicles" value={vehicles} icon={Truck} href="/dashboard/vehicles" />
        <StatCard label="Drivers" value={drivers} icon={UserCheck} href="/dashboard/drivers" />
      </div>
      <QuickLinks
        links={[
          { href: '/dashboard/vehicles', label: 'Vehicles' },
          { href: '/dashboard/drivers', label: 'Drivers' },
        ]}
      />
    </div>
  )
}
