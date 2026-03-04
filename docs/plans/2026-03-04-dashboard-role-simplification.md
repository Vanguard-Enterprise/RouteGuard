# Dashboard Role Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add preset org roles for school district staff personas and a role-aware overview page with an admin view switcher.

**Architecture:** Preset role templates are added to the existing Settings > Roles UI and create roles via the existing API. The overview page detects the user's persona from their permissions server-side and renders a tailored layout. Admins with `org:manage` get a `?view=` search param override plus a dropdown switcher.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui (Select), lucide-react

---

### Task 1: Add preset role templates to roles-management

**Files:**
- Modify: `dashboard/components/dashboard/roles-management.tsx`

**Step 1: Add the PRESET_ROLES constant and creating state**

Near the top of the file, after `AVAILABLE_PERMISSIONS`, add:

```tsx
const PRESET_ROLES = [
  {
    name: 'School Admin',
    description: 'Read-only monitoring for school administrators.',
    permissions: ['trips:read', 'students:read', 'routes:read', 'reports:read'],
  },
  {
    name: 'Dispatcher',
    description: 'Trip operations - manage and track active trips.',
    permissions: ['trips:read', 'trips:write', 'routes:read', 'drivers:read', 'vehicles:read'],
  },
  {
    name: 'Routing Specialist',
    description: 'Route and student management - build and maintain routes.',
    permissions: [
      'routes:read', 'routes:write',
      'students:read', 'students:write',
      'schools:read', 'schools:write',
      'drivers:read', 'vehicles:read',
    ],
  },
  {
    name: 'Fleet Manager',
    description: 'Vehicle and driver management for fleet operations.',
    permissions: ['vehicles:read', 'vehicles:write', 'drivers:read', 'reports:read'],
  },
]
```

**Step 2: Add `creatingPreset` state and `handleAddPreset` inside `RolesManagement`**

After the existing state declarations:

```tsx
const [creatingPreset, setCreatingPreset] = useState<string | null>(null)
```

After `handleDelete`:

```tsx
async function handleAddPreset(preset: (typeof PRESET_ROLES)[number]) {
  setCreatingPreset(preset.name)
  try {
    const created = await api.settings.roles.create({
      name: preset.name,
      permissions: preset.permissions,
    })
    setRoles((prev) => [...prev, created])
  } catch {
    // silently fail - role list will not update
  } finally {
    setCreatingPreset(null)
  }
}
```

**Step 3: Add the preset roles section to the JSX**

Insert this block inside the returned JSX, right after `{showCreate && <RoleForm ... />}` and before the `{systemRoles.length > 0 && ...}` block:

```tsx
<div>
  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
    Preset Roles
  </h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {PRESET_ROLES.map((preset) => {
      const exists = roles.some((r) => r.name === preset.name)
      const isCreating = creatingPreset === preset.name
      return (
        <div
          key={preset.name}
          className="bg-white border border-gray-100 rounded-xl px-5 py-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-gray-800 text-sm">{preset.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
            </div>
            <button
              onClick={() => !exists && !isCreating && handleAddPreset(preset)}
              disabled={exists || isCreating}
              className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60"
              style={
                exists
                  ? { border: '1px solid #e5e7eb', color: '#9ca3af' }
                  : { backgroundColor: 'var(--color-brand-navy)', color: 'white' }
              }
            >
              {exists ? 'Already added' : isCreating ? 'Adding...' : 'Add to org'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mt-3">
            {preset.permissions.map((perm) => (
              <span
                key={perm}
                className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded"
              >
                {perm}
              </span>
            ))}
          </div>
        </div>
      )
    })}
  </div>
</div>
```

**Step 4: Verify build**

```bash
cd dashboard && npm run build
```

Expected: no TypeScript errors, build succeeds.

**Step 5: Commit**

```bash
git add dashboard/components/dashboard/roles-management.tsx
git commit -m "feat: add preset role templates to roles settings"
```

---

### Task 2: Create PersonaViewSwitcher component

**Files:**
- Create: `dashboard/components/dashboard/persona-view-switcher.tsx`

**Step 1: Write the component**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type Persona =
  | 'admin'
  | 'school_admin'
  | 'dispatcher'
  | 'routing_specialist'
  | 'fleet_manager'

export const PERSONA_LABELS: Record<Persona, string> = {
  admin: 'Admin',
  school_admin: 'School Admin',
  dispatcher: 'Dispatcher',
  routing_specialist: 'Routing Specialist',
  fleet_manager: 'Fleet Manager',
}

interface PersonaViewSwitcherProps {
  current: Persona
  natural: Persona
}

export function PersonaViewSwitcher({ current, natural }: PersonaViewSwitcherProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={current}
        onValueChange={(v) => router.push(`/dashboard?view=${v}`)}
      >
        <SelectTrigger className="w-48 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
            <SelectItem key={p} value={p}>
              {PERSONA_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current !== natural && (
        <span className="text-xs text-muted-foreground">
          Viewing as: {PERSONA_LABELS[current]}
        </span>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

```bash
cd dashboard && npm run build
```

Expected: no errors.

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/persona-view-switcher.tsx
git commit -m "feat: add PersonaViewSwitcher component"
```

---

### Task 3: Replace overview page with role-aware content

**Files:**
- Modify: `dashboard/app/dashboard/page.tsx`

**Step 1: Replace the entire file with the following**

Key points before reading the code:
- `getServerUser()` is imported from `@/lib/server-api` - returns `User | null`
- `User.permissions` is `string[]` - these are the permission strings like `'trips:read'`
- `org:manage` is the admin permission that grants Settings access
- `api.trips.list()` accepts an optional `Record<string, string>` for query params
- The `safe` helper redirects to `/staff/login` on 401, returns `null` on other errors
- `Persona` type and `PERSONA_LABELS` are exported from `persona-view-switcher.tsx`

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { type LucideIcon, Route, GraduationCap, School, Truck, UserCheck, Bus } from 'lucide-react'
import { api, APIError, type Trip } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PersonaViewSwitcher,
  type Persona,
  PERSONA_LABELS,
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
    const activeCount = trips.filter((t) => t.status === 'in_progress').length

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
```

**Step 2: Verify lint passes**

```bash
cd dashboard && npm run lint
```

Expected: 0 errors. If there are apostrophe lint errors, they are from `Today's` in JSX -- either use `&apos;` or wrap in a JS expression: `{"Today's Trips"}`. The plan already uses `&apos;` in one spot.

**Step 3: Verify build passes**

```bash
cd dashboard && npm run build
```

Expected: build completes with no TypeScript errors.

**Step 4: Smoke test manually**

- Log in as an admin user: overview shows the 5-card grid + view switcher dropdown in top-right
- Switch dropdown to "Dispatcher": page reloads showing active/scheduled trip cards + today's trip list
- Switch to "Fleet Manager": page shows vehicles/drivers cards only
- Switch back to "Admin": original 5-card grid
- Log in as a user with only `trips:read` + `students:read` (school admin role): no switcher visible, sees school admin layout

**Step 5: Commit**

```bash
git add dashboard/app/dashboard/page.tsx
git commit -m "feat: role-aware overview page with admin view switcher"
```

---

### Task 4: Final verification

**Step 1: Full lint + build**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 lint errors, build succeeds.

**Step 2: Commit if anything was missed**

```bash
git add -p
git commit -m "fix: overview page cleanup"
```
