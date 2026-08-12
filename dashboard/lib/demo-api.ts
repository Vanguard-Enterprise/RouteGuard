export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return localRequest<T>(path, init)
}

async function platformRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init)
}

async function orgRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init)
}

async function clientRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return localRequest<T>(path, init)
}

function qs(params?: Record<string, unknown>): string {
  if (!params) return ''
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      filtered[k] = Array.isArray(v) ? v.join(',') : String(v)
    }
  }
  const s = new URLSearchParams(filtered).toString()
  return s ? `?${s}` : ''
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return localRequest<T>(path, init)
}

// Types
export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface OrgOption {
  id: string
  name: string
  slug: string
  is_platform: boolean
}

export interface LoginResponse {
  user: AuthUser
  orgs: OrgOption[]
}

export interface AuthMethodsResponse {
  has_password: boolean
  sso_options: SSOOption[]
}

export interface SSOOption {
  connection_id: string
  type: string
  display_name: string
  org_slug: string
  org_name: string
}

export interface MeResponse {
  user: AuthUser
  active_org: OrgOption
  permissions: string[]
  home_org_id: string
}

export const DEMO_ORG: OrgOption = {
  id: 'demo-org',
  name: 'RouteGuard Demo District',
  slug: 'routeguard-demo',
  is_platform: false,
}

export const DEMO_USER: AuthUser = {
  id: 'demo-user',
  email: 'demo@route-guard.local',
  name: 'Demo User',
}

export const DEMO_ME: MeResponse = {
  user: DEMO_USER,
  active_org: DEMO_ORG,
  home_org_id: DEMO_ORG.id,
  permissions: [
    'org:manage',
    'vehicles:read',
    'vehicles:write',
    'drivers:read',
    'drivers:write',
    'stops:read',
    'stops:write',
    'planning:run',
  ],
}

function bodyValue(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string') return {}
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return {}
  }
}

function emptyPage<T>(path: string): PageResponse<T> {
  const query = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : null
  const page = Number(query?.get('page') ?? 1)
  const perPage = Number(query?.get('per_page') ?? 10)
  return { items: [], total: 0, page, per_page: perPage, total_pages: 1 }
}

function demoPage<T>(
  items: T[],
  path: string,
  searchable?: (item: T) => string[],
  matches?: (item: T, query: URLSearchParams) => boolean,
): PageResponse<T> {
  const query = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : null
  const search = query?.get('search')?.trim().toLowerCase() ?? ''
  const filtered = items.filter((item) => {
    const matchesSearch = !search || !searchable || searchable(item).some((value) => value.toLowerCase().includes(search))
    return matchesSearch && (!matches || !query || matches(item, query))
  })
  const page = Number(query?.get('page') ?? 1)
  const perPage = Number(query?.get('per_page') ?? 10)
  const pageSize = Math.max(1, perPage)
  const start = Math.max(0, page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  }
}

function csvQuery(query: URLSearchParams, key: string) {
  return (query.get(key) ?? '').split(',').map((value) => value.trim()).filter(Boolean)
}

function studentMatches(student: Student, query: URLSearchParams) {
  const status = query.get('status')
  const gradeMin = Number(query.get('grade_min'))
  const gradeMax = Number(query.get('grade_max'))
  const schools = csvQuery(query, 'schools')
  const guardianSearch = query.get('guardian_search')?.trim().toLowerCase() ?? ''
  const grade = Number(student.grade)
  return (
    (!status || status === 'all' || (status === 'active' ? student.is_active : !student.is_active)) &&
    (!query.has('grade_min') || grade >= gradeMin) &&
    (!query.has('grade_max') || grade <= gradeMax) &&
    (schools.length === 0 || schools.includes(student.school)) &&
    (!guardianSearch || `${student.guardian_name} ${student.guardian_contact}`.toLowerCase().includes(guardianSearch))
  )
}

function activeMatches<T extends { is_active: boolean }>(item: T, query: URLSearchParams) {
  const status = query.get('status')
  return !status || status === 'all' || (status === 'active' ? item.is_active : !item.is_active)
}

function driverMatches(driver: Driver, query: URLSearchParams) {
  const status = query.get('status')
  return (
    !status ||
    status === 'all' ||
    (status === 'active' && driver.is_active) ||
    (status === 'inactive' && !driver.is_active) ||
    (status === 'available' && driver.is_available) ||
    (status === 'unavailable' && !driver.is_available)
  )
}

function routeMatches(route: Route, query: URLSearchParams) {
  const status = query.get('status')
  return !status || status === 'all' || route.status === status
}

function timestamp() {
  return new Date().toISOString()
}

function pathId(path: string, resource: string) {
  const segments = path.split('?')[0].split('/').filter(Boolean)
  const index = segments.indexOf(resource)
  return index >= 0 ? segments[index + 1] : undefined
}

function nextId(prefix: string) {
  return `${prefix}-local-${Date.now()}`
}

// These collections intentionally live in the browser module instead of a server.
// They give the demo its interactive behavior without reintroducing a database.
let demoStudents: Student[]

function patchById<T extends { id: string }>(items: T[], id: string | undefined, patch: Partial<T>) {
  const index = id ? items.findIndex((item) => item.id === id) : -1
  if (index < 0) return undefined
  items[index] = { ...items[index], ...patch }
  return items[index]
}

function removeById<T extends { id: string; deleted_at?: string | null; is_active?: boolean }>(items: T[], id: string | undefined) {
  const item = id ? items.find((candidate) => candidate.id === id) : undefined
  if (!item) return undefined
  item.deleted_at = timestamp()
  if ('is_active' in item) item.is_active = false
  return item
}

function restoreById<T extends { id: string; deleted_at?: string | null; is_active?: boolean }>(items: T[], id: string | undefined) {
  const item = id ? items.find((candidate) => candidate.id === id) : undefined
  if (!item) return undefined
  item.deleted_at = null
  if ('is_active' in item) item.is_active = true
  return item
}

function applyDemoMutation(path: string, method: string, body: Record<string, unknown>) {
  const updatedAt = timestamp()

  if (path === '/org/students/status' && method === 'PUT') {
    const ids = Array.isArray(body.student_ids) ? body.student_ids.map(String) : []
    const isActive = body.is_active !== false
    demoStudents = demoStudents.map((student) => ids.includes(student.id) ? { ...student, is_active: isActive, deleted_at: isActive ? null : student.deleted_at, updated_at: updatedAt } : student)
    return { processed_count: ids.length, student_ids: ids }
  }
  if (path === '/org/students' && method === 'DELETE') {
    const ids = Array.isArray(body.student_ids) ? body.student_ids.map(String) : []
    ids.forEach((id) => removeById(demoStudents, id))
    return { processed_count: ids.length, student_ids: ids }
  }
  if (path === '/org/students' && method === 'POST') {
    const student: Student = {
      id: String(body.id ?? nextId('student')),
      org_id: DEMO_ORG.id,
      student_id: String(body.student_id ?? nextId('RG')),
      first_name: String(body.first_name ?? 'Demo'),
      last_name: String(body.last_name ?? 'Student'),
      grade: String(body.grade ?? 'K'),
      school: String(body.school ?? DEMO_SCHOOLS[0]?.name ?? 'Demo School'),
      guardian_name: String(body.guardian_name ?? 'Demo Guardian'),
      guardian_contact: String(body.guardian_contact ?? ''),
      is_active: body.is_active !== false,
      created_at: updatedAt,
      updated_at: updatedAt,
    }
    demoStudents.push(student)
    return student
  }
  if (path.startsWith('/org/students/') && path.endsWith('/restore') && method === 'POST') return restoreById(demoStudents, pathId(path, 'students'))
  if (path.startsWith('/org/students/') && path.endsWith('/stop-assignment') && method === 'PUT') return { student_id: pathId(path, 'students'), stop_id: String(body.stop_id ?? ''), service_window: body.service_window ?? 'PM', is_active: body.is_active !== false }
  if (path.startsWith('/org/students/') && method === 'PUT') return patchById(demoStudents, pathId(path, 'students'), { ...body, updated_at: updatedAt } as Partial<Student>)
  if (path.startsWith('/org/students/') && method === 'DELETE') return removeById(demoStudents, pathId(path, 'students'))

  if (path === '/org/schools' && method === 'POST') {
    const school: School = {
      id: String(body.id ?? nextId('school')),
      org_id: DEMO_ORG.id,
      school_id: String(body.school_id ?? nextId('SCH')),
      name: String(body.name ?? 'Demo School'),
      address: String(body.address ?? ''),
      contact_phone: String(body.contact_phone ?? ''),
      is_active: body.is_active !== false,
      created_at: updatedAt,
      updated_at: updatedAt,
    }
    demoSchools.push(school)
    return school
  }
  if (path.startsWith('/org/schools/') && path.endsWith('/restore') && method === 'POST') return restoreById(demoSchools, pathId(path, 'schools'))
  if (path.startsWith('/org/schools/') && method === 'PUT') return patchById(demoSchools, pathId(path, 'schools'), { ...body, updated_at: updatedAt } as Partial<School>)
  if (path.startsWith('/org/schools/') && method === 'DELETE') return removeById(demoSchools, pathId(path, 'schools'))

  if (path === '/org/vehicles' && method === 'POST') {
    const vehicle: Vehicle = {
      id: String(body.id ?? nextId('vehicle')),
      org_id: DEMO_ORG.id,
      vehicle_id: String(body.vehicle_id ?? nextId('BUS')),
      license_plate: String(body.license_plate ?? 'DEMO-000'),
      capacity: Number(body.capacity ?? 40),
      is_active: body.is_active !== false,
      created_at: updatedAt,
      updated_at: updatedAt,
    }
    demoVehicles.push(vehicle)
    return vehicle
  }
  if (path.startsWith('/org/vehicles/') && path.endsWith('/restore') && method === 'POST') return restoreById(demoVehicles, pathId(path, 'vehicles'))
  if (path.startsWith('/org/vehicles/') && method === 'PUT') return patchById(demoVehicles, pathId(path, 'vehicles'), { ...body, updated_at: updatedAt } as Partial<Vehicle>)
  if (path.startsWith('/org/vehicles/') && method === 'DELETE') return removeById(demoVehicles, pathId(path, 'vehicles'))

  if (path === '/org/drivers' && method === 'POST') {
    const driver: Driver = {
      id: String(body.id ?? nextId('driver')),
      org_id: DEMO_ORG.id,
      driver_id: String(body.driver_id ?? nextId('DRV')),
      name: String(body.name ?? 'Demo Driver'),
      phone: String(body.phone ?? ''),
      is_available: body.is_available !== false,
      is_active: body.is_active !== false,
      has_pin: false,
      pin_updated_at: null,
      created_at: updatedAt,
      updated_at: updatedAt,
    }
    demoDrivers.push(driver)
    return driver
  }
  if (path.startsWith('/org/drivers/') && path.endsWith('/restore') && method === 'POST') return restoreById(demoDrivers, pathId(path, 'drivers'))
  if (path.startsWith('/org/drivers/') && path.endsWith('/pin') && method === 'PUT') return patchById(demoDrivers, pathId(path, 'drivers'), { has_pin: true, pin_updated_at: updatedAt, updated_at: updatedAt } as Partial<Driver>)
  if (path.startsWith('/org/drivers/') && path.endsWith('/pin') && method === 'DELETE') return patchById(demoDrivers, pathId(path, 'drivers'), { has_pin: false, pin_updated_at: null, updated_at: updatedAt } as Partial<Driver>)
  if (path.startsWith('/org/drivers/') && method === 'PUT') return patchById(demoDrivers, pathId(path, 'drivers'), { ...body, updated_at: updatedAt } as Partial<Driver>)
  if (path.startsWith('/org/drivers/') && method === 'DELETE') return removeById(demoDrivers, pathId(path, 'drivers'))

  if (path === '/org/stops' && method === 'POST') {
    const stop: Stop = {
      id: String(body.id ?? nextId('stop')),
      org_id: DEMO_ORG.id,
      stop_id: String(body.stop_id ?? nextId('STOP')),
      name: String(body.name ?? 'Demo Stop'),
      address: String(body.address ?? ''),
      latitude: Number(body.latitude ?? 38.473),
      longitude: Number(body.longitude ?? -77.996),
      notes: String(body.notes ?? ''),
      is_active: body.is_active !== false,
      created_at: updatedAt,
      updated_at: updatedAt,
    }
    demoStops.push(stop)
    return stop
  }
  if (path.startsWith('/org/stops/') && path.endsWith('/restore') && method === 'POST') return restoreById(demoStops, pathId(path, 'stops'))
  if (path.startsWith('/org/stops/') && method === 'PUT') return patchById(demoStops, pathId(path, 'stops'), { ...body, updated_at: updatedAt } as Partial<Stop>)
  if (path.startsWith('/org/stops/') && method === 'DELETE') return removeById(demoStops, pathId(path, 'stops'))

  if (path === '/org/routes' && method === 'POST') return { run: { ...DEMO_PLANNER_RUNS[0], ...body, id: nextId('run'), status: 'draft', created_at: updatedAt }, issues: [] }
  if (path.startsWith('/org/routes/') && path.endsWith('/restore') && method === 'POST') return restoreById(demoRoutes, pathId(path, 'routes'))
  if (path.startsWith('/org/routes/') && method === 'PUT') return patchById(demoRoutes, pathId(path, 'routes'), { ...body, updated_at: updatedAt } as Partial<Route>)
  if (path.startsWith('/org/routes/') && method === 'DELETE') return removeById(demoRoutes, pathId(path, 'routes'))

  if (path === '/org/driver-vehicle-assignments' && method === 'POST') {
    const assignment = { id: String(body.id ?? nextId('assignment')), driver_id: String(body.driver_id ?? ''), vehicle_id: String(body.vehicle_id ?? ''), is_active: body.is_active !== false, created_at: updatedAt, updated_at: updatedAt }
    const existing = demoAssignments.findIndex((item) => item.driver_id === assignment.driver_id && item.vehicle_id === assignment.vehicle_id)
    if (existing >= 0) demoAssignments[existing] = assignment
    else demoAssignments.push(assignment)
    return assignment
  }

  if (path === '/org/planner-runs' && method === 'POST') {
    const run: PlannerRun = { id: nextId('run'), org_id: DEMO_ORG.id, mode: body.mode === 'FEWEST_BUSES' ? 'FEWEST_BUSES' : 'FASTEST_TIME', service_window: 'PM', status: 'draft', created_by: DEMO_USER.id, created_at: updatedAt, published_at: null }
    demoPlannerRuns.push(run)
    return { run, issues: [] }
  }
  if (path.startsWith('/org/planner-runs/') && path.endsWith('/publish') && method === 'POST') return patchById(demoPlannerRuns, pathId(path, 'planner-runs'), { status: 'published', published_at: updatedAt } as Partial<PlannerRun>)

  if (path === '/org/support/tickets' && method === 'POST') {
    const ticket: SupportTicket = { id: nextId('ticket'), org_id: DEMO_ORG.id, created_by_user_id: DEMO_USER.id, assigned_admin_user_id: null, subject: String(body.subject ?? 'Demo support request'), status: 'open', created_at: updatedAt, updated_at: updatedAt, last_message_at: updatedAt, resolved_at: null }
    const message: SupportMessage = { id: nextId('message'), ticket_id: ticket.id, sender_user_id: DEMO_USER.id, sender_org_id: DEMO_ORG.id, sender_is_platform: false, body: String(body.body ?? ''), created_at: updatedAt }
    demoTickets.push(ticket)
    demoMessages[ticket.id] = [message]
    return { ticket, message }
  }
  if (path.startsWith('/org/support/tickets/') && path.endsWith('/messages') && method === 'POST') {
    const ticketId = pathId(path, 'tickets') ?? ''
    const message: SupportMessage = { id: nextId('message'), ticket_id: ticketId, sender_user_id: DEMO_USER.id, sender_org_id: DEMO_ORG.id, sender_is_platform: false, body: String(body.body ?? ''), created_at: updatedAt }
    demoMessages[ticketId] = [...(demoMessages[ticketId] ?? []), message]
    const ticket = patchById(demoTickets, ticketId, { updated_at: updatedAt, last_message_at: updatedAt } as Partial<SupportTicket>)
    return { ticket, message }
  }

  return method === 'DELETE' ? undefined : { ...body, id: String(body.id ?? nextId('local-demo-record')) }
}

function localRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const body = bodyValue(init)
  let value: unknown

  if (path.includes('/auth/lookup')) value = { has_password: true, sso_options: [] }
  else if (path.includes('/auth/login')) value = { user: DEMO_USER, orgs: [DEMO_ORG] }
  else if (path.includes('/auth/me')) value = DEMO_ME
  else if (path.includes('/auth/orgs')) value = [DEMO_ORG]
  else if (path.includes('/auth/switch-org')) value = { org: DEMO_ORG, permissions: DEMO_ME.permissions }
  else if (method !== 'GET') value = applyDemoMutation(path, method, body)
  else if (path.includes('/platform/stats')) value = { total_orgs: 1, suspended_orgs: 0, total_users: 1, active_sessions: 1, active_trips: 1 }
  else if (path.includes('/platform/audit')) value = { items: DEMO_AUDIT_EVENTS, next_cursor: '', has_more: false }
  else if (path.includes('/platform/updates/install-command')) value = { release: DEMO_RELEASES[0] ?? null, command: 'Demo installs are simulated locally.' }
  else if (path.includes('/platform/updates/rollout')) value = DEMO_ROLLOUT
  else if (path.includes('/org/students/filter-options')) value = { grades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], schools: demoSchools.map((school) => school.name) }
  else if (path.includes('/org/driver-vehicle-assignments')) value = { items: demoAssignments }
  else if (path.includes('/org/settings')) value = DEMO_ORGANIZATION
  else if (path.includes('/org/billing')) value = DEMO_BILLING
  else if (path.includes('/org/support/tickets/') && path.endsWith('/messages')) value = demoMessages[path.split('/').at(-2) ?? ''] ?? []
  else if (path.includes('/org/support/tickets')) value = demoPage(demoTickets, path, (ticket) => [ticket.subject, ticket.status], (ticket, query) => !query.get('status') || query.get('status') === ticket.status)
  else if (path.includes('/org/students/deleted')) value = demoPage(demoStudents.filter((student) => student.deleted_at), path, (student) => [student.first_name, student.last_name, student.student_id], studentMatches)
  else if (path.includes('/org/students')) value = demoPage(demoStudents.filter((student) => !student.deleted_at), path, (student) => [student.first_name, student.last_name, student.student_id, student.school, student.guardian_name], studentMatches)
  else if (path.includes('/org/schools/deleted')) value = demoPage(demoSchools.filter((school) => school.deleted_at), path, (school) => [school.name, school.address], activeMatches)
  else if (path.includes('/org/schools')) value = demoPage(demoSchools.filter((school) => !school.deleted_at), path, (school) => [school.name, school.address, school.contact_phone], activeMatches)
  else if (path.includes('/org/vehicles/deleted')) value = demoPage(demoVehicles.filter((vehicle) => vehicle.deleted_at), path, (vehicle) => [vehicle.vehicle_id, vehicle.license_plate], activeMatches)
  else if (path.includes('/org/vehicles')) value = demoPage(demoVehicles.filter((vehicle) => !vehicle.deleted_at), path, (vehicle) => [vehicle.vehicle_id, vehicle.license_plate], activeMatches)
  else if (path.includes('/org/drivers/deleted')) value = demoPage(demoDrivers.filter((driver) => driver.deleted_at), path, (driver) => [driver.name, driver.driver_id, driver.phone], driverMatches)
  else if (path.includes('/org/drivers')) value = demoPage(demoDrivers.filter((driver) => !driver.deleted_at), path, (driver) => [driver.name, driver.driver_id, driver.phone], driverMatches)
  else if (path.includes('/org/stops/deleted')) value = demoPage(demoStops.filter((stop) => stop.deleted_at), path, (stop) => [stop.name, stop.stop_id, stop.address], activeMatches)
  else if (path.includes('/org/stops')) value = demoPage(demoStops.filter((stop) => !stop.deleted_at), path, (stop) => [stop.name, stop.stop_id, stop.address], activeMatches)
  else if (path.includes('/org/routes/') && !path.includes('/deleted') && method === 'GET') {
    const route = demoRoutes.find((candidate) => path.includes(`/${candidate.id}`)) ?? demoRoutes[0]
    value = { route, stops: demoStops.slice(0, 3), students: demoStudents.slice(0, route.assigned_students > 30 ? 4 : 3) }
  }
  else if (path.includes('/org/routes/deleted')) value = demoPage(demoRoutes.filter((route) => route.deleted_at), path, (route) => [route.route_code, route.status], routeMatches)
  else if (path.includes('/org/routes')) value = demoPage(demoRoutes.filter((route) => !route.deleted_at), path, (route) => [route.route_code, route.status, route.objective_mode], routeMatches)
  else if (path.includes('/org/planner-runs/') && method === 'GET') {
    const run = demoPlannerRuns.find((candidate) => path.includes(`/${candidate.id}`)) ?? demoPlannerRuns[0]
    value = { run, routes: demoRoutes.filter((route) => route.planner_run_id === run.id), issues: [] }
  }
  else if (path.includes('/org/planner-runs')) value = demoPage(demoPlannerRuns, path, (run) => [run.status, run.mode, run.service_window])
  else if (path.includes('/org/members')) value = DEMO_MEMBERS
  else if (path.includes('/org/roles')) value = DEMO_ROLES
  else if (path.includes('/org/sso')) value = DEMO_SSO_CONNECTIONS
  else if (path.includes('/org/integrations')) value = DEMO_INTEGRATIONS
  else if (path.includes('/org/devices')) value = DEMO_DEVICES
  else if (path.includes('/platform/billing')) value = DEMO_BILLING_LIST
  else if (path.includes('/platform/updates/releases')) value = DEMO_RELEASES
  else if (path.includes('/platform/orgs/') && !path.endsWith('/members')) value = DEMO_ORGANIZATIONS.find((org) => path.includes(`/${org.id}`)) ?? DEMO_ORGANIZATION
  else if (path.includes('/platform/users/') && method === 'GET') {
    const user = DEMO_PLATFORM_USERS.find((candidate) => path.includes(`/${candidate.id}`)) ?? DEMO_PLATFORM_USERS[0]
    value = { ...user, memberships: [{ org_id: DEMO_ORG.id, org_name: DEMO_ORG.name, org_slug: DEMO_ORG.slug, roles: [{ id: 'role-admin', name: 'District Admin', permissions: DEMO_ME.permissions }] }] }
  }
  else if (path.includes('/platform/support/tickets/') && method === 'GET') value = DEMO_TICKETS.find((ticket) => path.includes(`/${ticket.id}`)) ?? DEMO_TICKETS[0]
  else if (path.includes('/platform/orgs') && method === 'GET') value = demoPage(DEMO_ORGANIZATIONS, path, (org) => [org.name, org.slug])
  else if (path.includes('/platform/users') && method === 'GET') value = demoPage(DEMO_PLATFORM_USERS, path, (user) => [user.name, user.email])
  else if (path.includes('/platform/support/tickets') && method === 'GET') value = demoPage(DEMO_TICKETS, path, (ticket) => [ticket.subject, ticket.status])
  else if (path.includes('/platform/') || path.includes('/org/')) value = path.includes('?') || method === 'GET' ? emptyPage(path) : (method === 'DELETE' ? undefined : { ...body, id: 'local-demo-record' })
  else value = {}

  return Promise.resolve(value as T)
}

export interface Organization {
  id: string
  name: string
  slug: string
  is_platform: boolean
  is_demo: boolean
  demo_template_version: string | null
  demo_last_reset_at: string | null
  suspended_at: string | null
  deleted_at: string | null
  member_count?: number
  created_at: string
  updated_at: string
}

export interface DemoResetRun {
  id: string
  org_id: string
  template_version: string
  reset_mode: "full" | "refresh"
  status: "running" | "succeeded" | "failed"
  started_by_user_id: string
  started_by_email: string
  started_at: string
  completed_at: string | null
  last_error: string | null
}

export interface DemoResetStatus {
  org_id: string
  template_version: string
  latest_run: DemoResetRun | null
}

export interface OrgBilling {
  id: string
  org_id: string
  billing_status: "pilot" | "active" | "cancelled"
  pilot_ends_at: string | null
  contract_notes: string
  billing_contact_email: string
  created_at: string
  updated_at: string
  org_name?: string
  org_slug?: string
}

export interface AuditEvent {
  id: string
  actor_id: string
  actor_email: string
  org_id: string | null
  event_type: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface PlatformStats {
  total_orgs: number
  suspended_orgs: number
  total_users: number
  active_sessions: number
  active_trips: number
}

export interface SoftwareRelease {
  id: string
  version: string
  release_date: string
  release_notes: string
  artifact_url: string
  artifact_sha256: string
  installer_url: string
  target_os: string
  target_arch: string
  is_install_default: boolean
  created_at: string
}

export interface DeviceInstallCommand {
  release: SoftwareRelease | null
  command: string
}

export interface DeviceRolloutStatus {
  id: string
  org_id: string
  org_name: string
  vehicle_id?: string | null
  vehicle_label?: string | null
  device_key: string
  name: string
  software_version: string
  connectivity_state: string
  app_health: string
  last_seen_at: string | null
}

export interface RolloutOrgSummary {
  org_id: string
  org_name: string
  total_devices: number
  on_latest: number
  behind_latest: number
  percent_up_to_date: number
  devices: DeviceRolloutStatus[]
}

export interface RolloutSummary {
  latest_release: SoftwareRelease | null
  total_devices: number
  on_latest: number
  behind_latest: number
  percent_up_to_date: number
  organizations: RolloutOrgSummary[]
}

export interface OrgDevice {
  id: string
  org_id?: string | null
  vehicle_id?: string | null
  device_key: string
  name: string
  software_version: string
  connectivity_state: string
  app_health: string
  enrollment_code?: string | null
  enrollment_expires_at?: string | null
  enrolled_at?: string | null
  token_issued_at?: string | null
  revoked_at?: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface PlatformUser {
  id: string
  email: string
  name: string
  disabled_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface PlatformCreatedUser extends PlatformUser {
  magic_link_url?: string | null
}

export interface PlatformUserDetail extends PlatformUser {
  memberships: {
    org_id: string
    org_name: string
    org_slug: string
    roles: { id: string; name: string; permissions: string[] }[]
  }[]
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface CursorResponse<T> {
  items: T[]
  next_cursor: string
  has_more: boolean
}

export interface SSOConnection {
  id: string
  org_id: string
  type: "saml" | "oidc"
  display_name: string
  enabled: boolean
  oidc_issuer_url?: string
  oidc_client_id?: string
  oidc_scopes?: string
  saml_entity_id?: string
  saml_sso_url?: string
  saml_metadata_url?: string
  created_at: string
  updated_at: string
}

export interface Integration {
  id: string
  org_id: string
  type: string
  display_name: string
  base_url: string
  has_api_key: boolean
  has_api_secret: boolean
  enabled: boolean
  sync_schedule: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  org_id: string
  student_id: string
  first_name: string
  last_name: string
  grade: string
  school: string
  guardian_name: string
  guardian_contact: string
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface StudentListParams extends Record<string, unknown> {
  search?: string
  status?: "active" | "inactive" | "all"
  grade_min?: number
  grade_max?: number
  schools?: string[]
  guardian_search?: string
  page?: number
  per_page?: number
}

export interface StudentFilterOptions {
  grades: number[]
  schools: string[]
}

export interface StudentUpsertPayload {
  student_id: string
  first_name: string
  last_name: string
  grade: string
  school: string
  guardian_name?: string
  guardian_contact?: string
  is_active?: boolean
}

export interface BulkStudentsResult {
  processed_count: number
  student_ids: string[]
}

export interface Vehicle {
  id: string
  org_id: string
  vehicle_id: string
  license_plate: string
  capacity: number
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface VehicleListParams extends Record<string, unknown> {
  search?: string
  status?: "active" | "inactive" | "all"
  page?: number
  per_page?: number
}

export interface VehicleUpsertPayload {
  vehicle_id: string
  license_plate: string
  capacity: number
  is_active?: boolean
}

export interface Driver {
  id: string
  org_id: string
  driver_id: string
  name: string
  phone: string
  is_available: boolean
  is_active: boolean
  has_pin: boolean
  pin_updated_at: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface DriverListParams extends Record<string, unknown> {
  search?: string
  status?: "active" | "inactive" | "available" | "unavailable" | "all"
  page?: number
  per_page?: number
}

export interface DriverUpsertPayload {
  driver_id: string
  name: string
  phone?: string
  is_available?: boolean
  is_active?: boolean
}

export interface Stop {
  id: string
  org_id: string
  stop_id: string
  name: string
  address: string
  latitude: number
  longitude: number
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface StopListParams extends Record<string, unknown> {
  search?: string
  status?: "active" | "inactive" | "all"
  page?: number
  per_page?: number
}

export interface StopUpsertPayload {
  stop_id?: string
  name: string
  address: string
  latitude: number
  longitude: number
  notes?: string
  is_active?: boolean
}

export interface Route {
  id: string
  org_id: string
  planner_run_id: string
  route_code: string
  service_window: "AM" | "PM"
  status: "draft" | "active" | "archived"
  objective_mode: "FASTEST_TIME" | "FEWEST_BUSES"
  vehicle_id?: string | null
  driver_id?: string | null
  estimated_travel_minutes: number
  assigned_students: number
  seat_utilization: number
  unassigned_count: number
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface RouteListParams extends Record<string, unknown> {
  status?: "draft" | "active" | "archived" | "all"
  page?: number
  per_page?: number
}

export interface PlannerRun {
  id: string
  org_id: string
  mode: "FASTEST_TIME" | "FEWEST_BUSES"
  service_window: "AM" | "PM"
  status: "draft" | "published"
  created_by: string
  created_at: string
  published_at?: string | null
}

export interface PlannerIssue {
  id: string
  issue_type: string
  severity: "info" | "warning" | "error"
  message: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface School {
  id: string
  org_id: string
  school_id: string
  name: string
  address: string
  contact_phone: string
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface SchoolListParams extends Record<string, unknown> {
  search?: string
  status?: "active" | "inactive" | "all"
  page?: number
  per_page?: number
}

export interface SchoolUpsertPayload {
  name: string
  address: string
  contact_phone?: string
  is_active?: boolean
}

export interface OrgMember {
  user_id: string
  email: string
  name: string
  roles: { id: string; name: string }[]
}

export interface OrgRole {
  id: string
  name: string
  permissions: string[]
  is_system: boolean
}

export type SupportTicketStatus = "open" | "in_progress" | "waiting" | "resolved"

export interface SupportTicket {
  id: string
  org_id: string
  created_by_user_id: string
  assigned_admin_user_id: string | null
  subject: string
  status: SupportTicketStatus
  created_at: string
  updated_at: string
  last_message_at: string
  resolved_at: string | null
}

export interface SupportMessage {
  id: string
  ticket_id: string
  sender_user_id: string
  sender_org_id: string
  sender_is_platform: boolean
  body: string
  created_at: string
}

const DEMO_TIME = '2026-08-08T12:00:00.000Z'

export const DEMO_ORGANIZATION: Organization = {
  ...DEMO_ORG,
  is_demo: true,
  demo_template_version: 'e2-demo',
  demo_last_reset_at: DEMO_TIME,
  suspended_at: null,
  deleted_at: null,
  member_count: 4,
  created_at: '2026-01-15T12:00:00.000Z',
  updated_at: DEMO_TIME,
}

export const DEMO_SCHOOLS: School[] = [
  { id: 'school-elm', org_id: DEMO_ORG.id, school_id: 'SCH-001', name: 'Emerald Hill Elementary', address: '1320 Diamond Farm Road', contact_phone: '(540) 555-0101', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'school-culpeper', org_id: DEMO_ORG.id, school_id: 'SCH-002', name: 'Culpeper Middle School', address: '14300 Achievement Drive', contact_phone: '(540) 555-0102', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'school-high', org_id: DEMO_ORG.id, school_id: 'SCH-003', name: 'Culpeper County High School', address: '14240 Achievement Drive', contact_phone: '(540) 555-0103', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'school-archive', org_id: DEMO_ORG.id, school_id: 'SCH-004', name: 'Old Town Learning Center', address: '508 Main Street', contact_phone: '', is_active: false, created_at: DEMO_TIME, updated_at: DEMO_TIME, deleted_at: '2026-08-01T12:00:00.000Z' },
]

export const DEMO_STUDENTS: Student[] = [
  { id: 'student-001', org_id: DEMO_ORG.id, student_id: 'RG-1001', first_name: 'Maya', last_name: 'Brooks', grade: '5', school: 'Emerald Hill Elementary', guardian_name: 'Jordan Brooks', guardian_contact: '(540) 555-0141', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'student-002', org_id: DEMO_ORG.id, student_id: 'RG-1002', first_name: 'Liam', last_name: 'Carter', grade: '7', school: 'Culpeper Middle School', guardian_name: 'Avery Carter', guardian_contact: '(540) 555-0142', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'student-003', org_id: DEMO_ORG.id, student_id: 'RG-1003', first_name: 'Sofia', last_name: 'Nguyen', grade: '10', school: 'Culpeper County High School', guardian_name: 'Minh Nguyen', guardian_contact: '(540) 555-0143', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'student-004', org_id: DEMO_ORG.id, student_id: 'RG-1004', first_name: 'Ethan', last_name: 'Reed', grade: '3', school: 'Emerald Hill Elementary', guardian_name: 'Casey Reed', guardian_contact: '(540) 555-0144', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'student-005', org_id: DEMO_ORG.id, student_id: 'RG-1005', first_name: 'Aaliyah', last_name: 'Davis', grade: '8', school: 'Culpeper Middle School', guardian_name: 'Taylor Davis', guardian_contact: '(540) 555-0145', is_active: false, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'student-006', org_id: DEMO_ORG.id, student_id: 'RG-1006', first_name: 'Noah', last_name: 'Morgan', grade: '4', school: 'Old Town Learning Center', guardian_name: 'Riley Morgan', guardian_contact: '(540) 555-0146', is_active: false, created_at: DEMO_TIME, updated_at: DEMO_TIME, deleted_at: '2026-08-02T12:00:00.000Z' },
]

export const DEMO_VEHICLES: Vehicle[] = [
  { id: 'vehicle-001', org_id: DEMO_ORG.id, vehicle_id: 'BUS-12', license_plate: 'RG-1201', capacity: 48, is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'vehicle-002', org_id: DEMO_ORG.id, vehicle_id: 'BUS-21', license_plate: 'RG-2101', capacity: 54, is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'vehicle-003', org_id: DEMO_ORG.id, vehicle_id: 'BUS-07', license_plate: 'RG-0701', capacity: 36, is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'vehicle-004', org_id: DEMO_ORG.id, vehicle_id: 'BUS-33', license_plate: 'RG-3301', capacity: 48, is_active: false, created_at: DEMO_TIME, updated_at: DEMO_TIME, deleted_at: '2026-08-03T12:00:00.000Z' },
]

export const DEMO_DRIVERS: Driver[] = [
  { id: 'driver-001', org_id: DEMO_ORG.id, driver_id: 'DRV-101', name: 'Alex Johnson', phone: '(540) 555-0161', is_available: true, is_active: true, has_pin: true, pin_updated_at: DEMO_TIME, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'driver-002', org_id: DEMO_ORG.id, driver_id: 'DRV-102', name: 'Morgan Lee', phone: '(540) 555-0162', is_available: true, is_active: true, has_pin: true, pin_updated_at: DEMO_TIME, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'driver-003', org_id: DEMO_ORG.id, driver_id: 'DRV-103', name: 'Samira Patel', phone: '(540) 555-0163', is_available: true, is_active: true, has_pin: false, pin_updated_at: null, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'driver-004', org_id: DEMO_ORG.id, driver_id: 'DRV-104', name: 'Chris Wilson', phone: '(540) 555-0164', is_available: false, is_active: true, has_pin: true, pin_updated_at: DEMO_TIME, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'driver-005', org_id: DEMO_ORG.id, driver_id: 'DRV-105', name: 'Jamie Parker', phone: '(540) 555-0165', is_available: false, is_active: false, has_pin: false, pin_updated_at: null, created_at: DEMO_TIME, updated_at: DEMO_TIME, deleted_at: '2026-08-04T12:00:00.000Z' },
]

export const DEMO_STOPS: Stop[] = [
  { id: 'stop-001', org_id: DEMO_ORG.id, stop_id: 'STOP-001', name: 'Mountain Run Library', address: '610 Mountain Run Lake Road', latitude: 38.47291, longitude: -78.0123, notes: 'Use the east entrance.', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'stop-002', org_id: DEMO_ORG.id, stop_id: 'STOP-002', name: 'Culpeper Baptist Church', address: '318 South West Street', latitude: 38.47112, longitude: -77.9962, notes: 'Pull into the side lot.', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'stop-003', org_id: DEMO_ORG.id, stop_id: 'STOP-003', name: 'Lakeview Community Center', address: '201 Lakeview Parkway', latitude: 38.4874, longitude: -78.0251, notes: '', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'stop-004', org_id: DEMO_ORG.id, stop_id: 'STOP-004', name: 'North Ridge Park', address: '902 North Ridge Road', latitude: 38.5019, longitude: -77.9817, notes: 'Stop near the playground.', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'stop-005', org_id: DEMO_ORG.id, stop_id: 'STOP-005', name: 'West Street Corner', address: '120 West Street', latitude: 38.4682, longitude: -77.9998, notes: '', is_active: false, created_at: DEMO_TIME, updated_at: DEMO_TIME, deleted_at: '2026-08-05T12:00:00.000Z' },
]

export const DEMO_PLANNER_RUNS: PlannerRun[] = [
  { id: 'run-001', org_id: DEMO_ORG.id, mode: 'FASTEST_TIME', service_window: 'PM', status: 'published', created_by: DEMO_USER.id, created_at: '2026-08-08T09:00:00.000Z', published_at: '2026-08-08T09:12:00.000Z' },
  { id: 'run-002', org_id: DEMO_ORG.id, mode: 'FEWEST_BUSES', service_window: 'PM', status: 'draft', created_by: DEMO_USER.id, created_at: '2026-08-08T11:30:00.000Z', published_at: null },
  { id: 'run-003', org_id: DEMO_ORG.id, mode: 'FASTEST_TIME', service_window: 'AM', status: 'published', created_by: DEMO_USER.id, created_at: '2026-08-07T06:30:00.000Z', published_at: '2026-08-07T06:45:00.000Z' },
]

export const DEMO_ROUTES: Route[] = [
  { id: 'route-001', org_id: DEMO_ORG.id, planner_run_id: 'run-001', route_code: 'PM-NORTH-01', service_window: 'PM', status: 'active', objective_mode: 'FASTEST_TIME', vehicle_id: 'vehicle-001', driver_id: 'driver-001', estimated_travel_minutes: 42, assigned_students: 31, seat_utilization: 64.6, unassigned_count: 0, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'route-002', org_id: DEMO_ORG.id, planner_run_id: 'run-001', route_code: 'PM-SOUTH-02', service_window: 'PM', status: 'active', objective_mode: 'FASTEST_TIME', vehicle_id: 'vehicle-002', driver_id: 'driver-002', estimated_travel_minutes: 51, assigned_students: 44, seat_utilization: 81.5, unassigned_count: 1, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'route-003', org_id: DEMO_ORG.id, planner_run_id: 'run-002', route_code: 'PM-EAST-03', service_window: 'PM', status: 'draft', objective_mode: 'FEWEST_BUSES', vehicle_id: 'vehicle-003', driver_id: 'driver-003', estimated_travel_minutes: 38, assigned_students: 27, seat_utilization: 75, unassigned_count: 2, created_at: DEMO_TIME, updated_at: DEMO_TIME },
]

export const DEMO_ASSIGNMENTS = [
  { id: 'assignment-001', driver_id: 'driver-001', vehicle_id: 'vehicle-001', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'assignment-002', driver_id: 'driver-002', vehicle_id: 'vehicle-002', is_active: true, created_at: DEMO_TIME, updated_at: DEMO_TIME },
]

export const DEMO_MEMBERS: OrgMember[] = [
  { user_id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, roles: [{ id: 'role-admin', name: 'District Admin' }] },
  { user_id: 'member-001', email: 'transport@route-guard.local', name: 'Taylor Transport', roles: [{ id: 'role-dispatch', name: 'Dispatcher' }] },
  { user_id: 'member-002', email: 'safety@route-guard.local', name: 'Casey Safety', roles: [{ id: 'role-viewer', name: 'Safety Viewer' }] },
]

export const DEMO_ROLES: OrgRole[] = [
  { id: 'role-admin', name: 'District Admin', permissions: DEMO_ME.permissions, is_system: true },
  { id: 'role-dispatch', name: 'Dispatcher', permissions: ['vehicles:read', 'drivers:read', 'stops:read', 'planning:run'], is_system: true },
  { id: 'role-viewer', name: 'Safety Viewer', permissions: ['vehicles:read', 'drivers:read', 'stops:read'], is_system: true },
]

export const DEMO_SSO_CONNECTIONS: SSOConnection[] = [{ id: 'sso-demo', org_id: DEMO_ORG.id, type: 'oidc', display_name: 'Demo sign-in (inactive)', enabled: false, oidc_issuer_url: 'https://demo.invalid', oidc_client_id: 'local-demo', oidc_scopes: 'openid profile email', created_at: DEMO_TIME, updated_at: DEMO_TIME }]
export const DEMO_INTEGRATIONS: Integration[] = [{ id: 'integration-demo', org_id: DEMO_ORG.id, type: 'student-information-system', display_name: 'Sample SIS (local)', base_url: 'local://demo', has_api_key: false, has_api_secret: false, enabled: false, sync_schedule: null, last_synced_at: null, created_at: DEMO_TIME, updated_at: DEMO_TIME }]
export const DEMO_DEVICES: OrgDevice[] = [
  { id: 'device-001', org_id: DEMO_ORG.id, vehicle_id: 'vehicle-001', device_key: 'RG-DEVICE-001', name: 'BUS-12 tablet', software_version: 'demo-1.0', connectivity_state: 'online', app_health: 'healthy', enrollment_code: null, enrollment_expires_at: null, enrolled_at: DEMO_TIME, token_issued_at: DEMO_TIME, revoked_at: null, last_seen_at: DEMO_TIME, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'device-002', org_id: DEMO_ORG.id, vehicle_id: 'vehicle-002', device_key: 'RG-DEVICE-002', name: 'BUS-21 tablet', software_version: 'demo-1.0', connectivity_state: 'online', app_health: 'healthy', enrollment_code: null, enrollment_expires_at: null, enrolled_at: DEMO_TIME, token_issued_at: DEMO_TIME, revoked_at: null, last_seen_at: '2026-08-08T11:55:00.000Z', created_at: DEMO_TIME, updated_at: DEMO_TIME },
]

export const DEMO_TICKETS: SupportTicket[] = [
  { id: 'ticket-001', org_id: DEMO_ORG.id, created_by_user_id: DEMO_USER.id, assigned_admin_user_id: null, subject: 'How do I publish a new route?', status: 'open', created_at: '2026-08-08T10:15:00.000Z', updated_at: '2026-08-08T10:15:00.000Z', last_message_at: '2026-08-08T10:15:00.000Z', resolved_at: null },
  { id: 'ticket-002', org_id: DEMO_ORG.id, created_by_user_id: 'member-001', assigned_admin_user_id: DEMO_USER.id, subject: 'Bus tablet demo status', status: 'in_progress', created_at: '2026-08-07T14:20:00.000Z', updated_at: '2026-08-08T09:05:00.000Z', last_message_at: '2026-08-08T09:05:00.000Z', resolved_at: null },
  { id: 'ticket-003', org_id: DEMO_ORG.id, created_by_user_id: 'member-002', assigned_admin_user_id: DEMO_USER.id, subject: 'Route export question', status: 'resolved', created_at: '2026-08-06T08:40:00.000Z', updated_at: '2026-08-06T11:10:00.000Z', last_message_at: '2026-08-06T11:10:00.000Z', resolved_at: '2026-08-06T11:10:00.000Z' },
]

export const DEMO_MESSAGES: Record<string, SupportMessage[]> = {
  'ticket-001': [{ id: 'message-001', ticket_id: 'ticket-001', sender_user_id: DEMO_USER.id, sender_org_id: DEMO_ORG.id, sender_is_platform: false, body: 'I would like to review the publishing flow for the afternoon routes.', created_at: '2026-08-08T10:15:00.000Z' }],
  'ticket-002': [{ id: 'message-002', ticket_id: 'ticket-002', sender_user_id: 'member-001', sender_org_id: DEMO_ORG.id, sender_is_platform: false, body: 'The BUS-21 tablet is showing the local demo connection.', created_at: '2026-08-08T09:05:00.000Z' }],
  'ticket-003': [{ id: 'message-003', ticket_id: 'ticket-003', sender_user_id: DEMO_USER.id, sender_org_id: DEMO_ORG.id, sender_is_platform: true, body: 'Route exports are represented as sample data in this demo.', created_at: '2026-08-06T11:10:00.000Z' }],
}

export const DEMO_PLATFORM_USERS: PlatformUser[] = [
  { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, disabled_at: null, last_login_at: DEMO_TIME, created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'platform-user-001', email: 'transport@route-guard.local', name: 'Taylor Transport', disabled_at: null, last_login_at: '2026-08-08T08:30:00.000Z', created_at: DEMO_TIME, updated_at: DEMO_TIME },
  { id: 'platform-user-002', email: 'safety@route-guard.local', name: 'Casey Safety', disabled_at: null, last_login_at: '2026-08-07T16:10:00.000Z', created_at: DEMO_TIME, updated_at: DEMO_TIME },
]

export const DEMO_ORGANIZATIONS: Organization[] = [DEMO_ORGANIZATION, { ...DEMO_ORGANIZATION, id: 'org-riverbend', name: 'Riverbend Demo Schools', slug: 'riverbend-demo', member_count: 2 }]
export const DEMO_BILLING: OrgBilling = { id: 'demo-billing', org_id: DEMO_ORG.id, billing_status: 'pilot', pilot_ends_at: null, contract_notes: 'Local demo plan', billing_contact_email: DEMO_USER.email, created_at: DEMO_TIME, updated_at: DEMO_TIME, org_name: DEMO_ORG.name, org_slug: DEMO_ORG.slug }
export const DEMO_BILLING_LIST: OrgBilling[] = [DEMO_BILLING, { ...DEMO_BILLING, id: 'riverbend-billing', org_id: 'org-riverbend', org_name: 'Riverbend Demo Schools', org_slug: 'riverbend-demo', billing_status: 'active', billing_contact_email: 'admin@riverbend.local' }]
export const DEMO_AUDIT_EVENTS: AuditEvent[] = [
  { id: 'audit-001', actor_id: DEMO_USER.id, actor_email: DEMO_USER.email, org_id: DEMO_ORG.id, event_type: 'route.demo_published', target_type: 'route', target_id: 'route-001', metadata: { route_code: 'PM-NORTH-01' }, ip_address: 'local', created_at: '2026-08-08T09:12:00.000Z' },
  { id: 'audit-002', actor_id: DEMO_USER.id, actor_email: DEMO_USER.email, org_id: DEMO_ORG.id, event_type: 'student.demo_updated', target_type: 'student', target_id: 'student-001', metadata: { field: 'guardian_contact' }, ip_address: 'local', created_at: '2026-08-08T08:40:00.000Z' },
  { id: 'audit-003', actor_id: 'member-001', actor_email: 'transport@route-guard.local', org_id: DEMO_ORG.id, event_type: 'driver.demo_assigned', target_type: 'vehicle', target_id: 'vehicle-002', metadata: { driver_id: 'driver-002' }, ip_address: 'local', created_at: '2026-08-07T14:20:00.000Z' },
]
export const DEMO_RELEASES: SoftwareRelease[] = [{ id: 'release-001', version: 'demo-1.0.0', release_date: '2026-08-01', release_notes: 'Initial E² demo release.', artifact_url: 'local://routeguard-demo', artifact_sha256: 'demo', installer_url: 'local://routeguard-demo-installer', target_os: 'linux', target_arch: 'amd64', is_install_default: true, created_at: DEMO_TIME }]
export const DEMO_ROLLOUT: RolloutSummary = { latest_release: DEMO_RELEASES[0], total_devices: DEMO_DEVICES.length, on_latest: DEMO_DEVICES.length, behind_latest: 0, percent_up_to_date: 100, organizations: [{ org_id: DEMO_ORG.id, org_name: DEMO_ORG.name, total_devices: DEMO_DEVICES.length, on_latest: DEMO_DEVICES.length, behind_latest: 0, percent_up_to_date: 100, devices: DEMO_DEVICES.map((device) => ({ id: device.id, org_id: DEMO_ORG.id, org_name: DEMO_ORG.name, vehicle_id: device.vehicle_id, vehicle_label: device.name, device_key: device.device_key, name: device.name, software_version: device.software_version, connectivity_state: device.connectivity_state, app_health: device.app_health, last_seen_at: device.last_seen_at })) }] }

demoStudents = [...DEMO_STUDENTS]
const demoSchools = [...DEMO_SCHOOLS]
const demoVehicles = [...DEMO_VEHICLES]
const demoDrivers = [...DEMO_DRIVERS]
const demoStops = [...DEMO_STOPS]
const demoRoutes = [...DEMO_ROUTES]
const demoPlannerRuns = [...DEMO_PLANNER_RUNS]
const demoAssignments = [...DEMO_ASSIGNMENTS]
const demoTickets = [...DEMO_TICKETS]
const demoMessages = Object.fromEntries(Object.entries(DEMO_MESSAGES).map(([id, messages]) => [id, [...messages]]))

// API methods
export const api = {
  auth: {
    lookup: (email: string) =>
      request<AuthMethodsResponse>('/auth/lookup', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    login: (email: string, password: string) =>
      authRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    consumeMagicLink: (token: string) =>
      authRequest<void>('/auth/magic-link/consume', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    logout: () => authRequest<void>('/auth/logout', { method: 'POST' }),
    me: () => request<MeResponse>('/auth/me'),
    switchOrg: (orgId: string) => {
      if (typeof window !== 'undefined') {
        return clientRequest<{ org: OrgOption; permissions: string[] }>('/auth/switch-org', {
          method: 'POST',
          body: JSON.stringify({ org_id: orgId }),
        })
      }
      return request<{ org: OrgOption; permissions: string[] }>('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ org_id: orgId }),
      })
    },
    orgs: () => {
      if (typeof window !== 'undefined') {
        return clientRequest<OrgOption[]>('/auth/orgs')
      }
      return request<OrgOption[]>('/auth/orgs')
    },
  },
  platform: {
    stats: () => platformRequest<PlatformStats>('/platform/stats'),
    orgs: {
      list: (params?: { search?: string; page?: number; per_page?: number }) =>
        platformRequest<PageResponse<Organization>>(`/platform/orgs${qs(params)}`),
      get: (id: string) => platformRequest<Organization>(`/platform/orgs/${id}`),
      create: (data: { name: string; slug: string }) =>
        platformRequest<Organization>('/platform/orgs', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { name: string; slug: string }) =>
        platformRequest<Organization>(`/platform/orgs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        platformRequest<void>(`/platform/orgs/${id}`, { method: 'DELETE' }),
      suspend: (id: string) =>
        platformRequest<void>(`/platform/orgs/${id}/suspend`, { method: 'POST' }),
      reactivate: (id: string) =>
        platformRequest<void>(`/platform/orgs/${id}/reactivate`, { method: 'POST' }),
      members: (id: string) =>
        platformRequest<unknown[]>(`/platform/orgs/${id}/members`),
      addMember: (id: string, userId: string) =>
        platformRequest<unknown>(`/platform/orgs/${id}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
      removeMember: (id: string, userId: string) =>
        platformRequest<void>(`/platform/orgs/${id}/members/${userId}`, { method: 'DELETE' }),
      updateMemberRoles: (id: string, userId: string, roleIds: string[]) =>
        platformRequest<void>(`/platform/orgs/${id}/members/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ role_ids: roleIds }) }),
      getBilling: (id: string) => platformRequest<OrgBilling>(`/platform/orgs/${id}/billing`),
      updateBilling: (id: string, data: Partial<OrgBilling>) =>
        platformRequest<OrgBilling>(`/platform/orgs/${id}/billing`, { method: 'PUT', body: JSON.stringify(data) }),
      demoResetStatus: (id: string) =>
        platformRequest<DemoResetStatus>(`/platform/orgs/${id}/demo-reset`),
      resetDemo: (id: string, data?: { reset_mode?: "full" | "refresh" }) =>
        platformRequest<DemoResetRun>(`/platform/orgs/${id}/demo-reset`, { method: 'POST', body: JSON.stringify(data ?? {}) }),
    },
    users: {
      list: (params?: { email?: string; page?: number; per_page?: number }) =>
        platformRequest<PageResponse<PlatformUser>>(`/platform/users${qs(params)}`),
      create: (data: {
        email: string
        name: string
        org_id?: string
        delivery_method?: "email" | "magic_link" | "password"
        initial_password?: string
      }) =>
        platformRequest<PlatformCreatedUser>('/platform/users', { method: 'POST', body: JSON.stringify(data) }),
      get: (id: string) => platformRequest<PlatformUserDetail>(`/platform/users/${id}`),
      disable: (id: string) => platformRequest<void>(`/platform/users/${id}/disable`, { method: 'POST' }),
      enable: (id: string) => platformRequest<void>(`/platform/users/${id}/enable`, { method: 'POST' }),
      resetPassword: (id: string) => platformRequest<void>(`/platform/users/${id}/reset-password`, { method: 'POST' }),
      revokeSessions: (id: string) => platformRequest<void>(`/platform/users/${id}/sessions`, { method: 'DELETE' }),
    },
    audit: {
      list: (params?: { cursor?: string; limit?: number; event_type?: string; actor_id?: string; start_date?: string; end_date?: string }) =>
        platformRequest<CursorResponse<AuditEvent>>(`/platform/audit${qs(params)}`),
    },
    billing: {
      listAll: () => platformRequest<OrgBilling[]>('/platform/billing'),
    },
    support: {
      listTickets: (params?: { status?: SupportTicketStatus; org_id?: string; assigned_to?: string; page?: number; per_page?: number }) =>
        platformRequest<PageResponse<SupportTicket>>(`/platform/support/tickets${qs(params)}`),
      getTicket: (id: string) =>
        platformRequest<SupportTicket>(`/platform/support/tickets/${id}`),
      updateTicket: (id: string, data: { status?: SupportTicketStatus; assigned_admin_user_id?: string | null }) =>
        platformRequest<SupportTicket>(`/platform/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      listMessages: (id: string) =>
        platformRequest<SupportMessage[]>(`/platform/support/tickets/${id}/messages`),
      sendMessage: (id: string, body: string) =>
        platformRequest<{ ticket: SupportTicket; message: SupportMessage }>(`/platform/support/tickets/${id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
    },
    updates: {
      releases: () => platformRequest<SoftwareRelease[]>('/platform/updates/releases'),
      createRelease: (data: {
        version: string
        release_date: string
        release_notes?: string
        artifact_url: string
        artifact_sha256: string
        installer_url: string
        target_os?: string
        target_arch?: string
        is_install_default?: boolean
      }) =>
        platformRequest<SoftwareRelease>('/platform/updates/releases', { method: 'POST', body: JSON.stringify(data) }),
      installCommand: () => platformRequest<DeviceInstallCommand>('/platform/updates/install-command'),
      rollout: () => platformRequest<RolloutSummary>('/platform/updates/rollout'),
    },
  },
  org: {
    settings: {
      get: () => orgRequest<Organization>('/org/settings'),
      update: (data: { name: string }) =>
        orgRequest<Organization>('/org/settings', { method: 'PUT', body: JSON.stringify(data) }),
    },
    members: {
      list: () => orgRequest<OrgMember[]>('/org/members'),
      create: (data: { email: string; name: string }) =>
        orgRequest<OrgMember>('/org/members', { method: 'POST', body: JSON.stringify(data) }),
      invite: (email: string) =>
        orgRequest<void>('/org/members/invite', { method: 'POST', body: JSON.stringify({ email }) }),
      remove: (userId: string) =>
        orgRequest<void>(`/org/members/${userId}`, { method: 'DELETE' }),
      updateRoles: (userId: string, roleIds: string[]) =>
        orgRequest<void>(`/org/members/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ role_ids: roleIds }) }),
    },
    roles: {
      list: () => orgRequest<OrgRole[]>('/org/roles'),
    },
    sso: {
      list: () => orgRequest<SSOConnection[]>('/org/sso'),
      create: (data: Partial<SSOConnection> & { oidc_client_secret?: string; saml_certificate?: string }) =>
        orgRequest<SSOConnection>('/org/sso', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<SSOConnection> & { oidc_client_secret?: string; saml_certificate?: string }) =>
        orgRequest<SSOConnection>(`/org/sso/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        orgRequest<void>(`/org/sso/${id}`, { method: 'DELETE' }),
    },
    billing: {
      get: () => orgRequest<OrgBilling>('/org/billing'),
      updateContact: (email: string) =>
        orgRequest<void>('/org/billing/contact', { method: 'PUT', body: JSON.stringify({ billing_contact_email: email }) }),
    },
    integrations: {
      list: () => orgRequest<Integration[]>('/org/integrations'),
      create: (data: { type: string; display_name: string; base_url: string; api_key?: string; api_secret?: string; enabled?: boolean }) =>
        orgRequest<Integration>('/org/integrations', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { display_name?: string; base_url?: string; api_key?: string; api_secret?: string; enabled?: boolean; type?: string }) =>
        orgRequest<Integration>(`/org/integrations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        orgRequest<void>(`/org/integrations/${id}`, { method: 'DELETE' }),
    },
    devices: {
      list: () => orgRequest<OrgDevice[]>('/org/devices'),
      claim: (data: { enrollment_code: string; vehicle_id?: string }) =>
        orgRequest<OrgDevice>('/org/devices/claim', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: { vehicle_id?: string | null; name?: string }) =>
        orgRequest<OrgDevice>(`/org/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      reset: (id: string) =>
        orgRequest<OrgDevice>(`/org/devices/${id}/reset`, { method: 'POST' }),
    },
    students: {
      list: (params?: StudentListParams) =>
        orgRequest<PageResponse<Student>>(`/org/students${qs(params)}`),
      filterOptions: () =>
        orgRequest<StudentFilterOptions>('/org/students/filter-options'),
      listDeleted: (params?: StudentListParams) =>
        orgRequest<PageResponse<Student>>(`/org/students/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<Student>(`/org/students/${id}`),
      create: (data: StudentUpsertPayload) =>
        orgRequest<Student>('/org/students', { method: 'POST', body: JSON.stringify(data) }),
      bulkUpdateStatus: (studentIds: string[], isActive: boolean) =>
        orgRequest<BulkStudentsResult>('/org/students/status', {
          method: 'PUT',
          body: JSON.stringify({ student_ids: studentIds, is_active: isActive }),
        }),
      bulkRemove: (studentIds: string[]) =>
        orgRequest<BulkStudentsResult>('/org/students', {
          method: 'DELETE',
          body: JSON.stringify({ student_ids: studentIds }),
        }),
      update: (id: string, data: StudentUpsertPayload) =>
        orgRequest<Student>(`/org/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (id: string) =>
        orgRequest<void>(`/org/students/${id}`, { method: 'DELETE' }),
      restore: (id: string) =>
        orgRequest<Student>(`/org/students/${id}/restore`, { method: 'POST' }),
    },
    schools: {
      list: (params?: SchoolListParams) =>
        orgRequest<PageResponse<School>>(`/org/schools${qs(params)}`),
      listDeleted: (params?: SchoolListParams) =>
        orgRequest<PageResponse<School>>(`/org/schools/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<School>(`/org/schools/${id}`),
      create: (data: SchoolUpsertPayload) =>
        orgRequest<School>('/org/schools', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: SchoolUpsertPayload) =>
        orgRequest<School>(`/org/schools/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (id: string) =>
        orgRequest<void>(`/org/schools/${id}`, { method: 'DELETE' }),
      restore: (id: string) =>
        orgRequest<School>(`/org/schools/${id}/restore`, { method: 'POST' }),
    },
    vehicles: {
      list: (params?: VehicleListParams) =>
        orgRequest<PageResponse<Vehicle>>(`/org/vehicles${qs(params)}`),
      listDeleted: (params?: VehicleListParams) =>
        orgRequest<PageResponse<Vehicle>>(`/org/vehicles/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<Vehicle>(`/org/vehicles/${id}`),
      create: (data: VehicleUpsertPayload) =>
        orgRequest<Vehicle>('/org/vehicles', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: VehicleUpsertPayload) =>
        orgRequest<Vehicle>(`/org/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (id: string) =>
        orgRequest<void>(`/org/vehicles/${id}`, { method: 'DELETE' }),
      restore: (id: string) =>
        orgRequest<Vehicle>(`/org/vehicles/${id}/restore`, { method: 'POST' }),
    },
    drivers: {
      list: (params?: DriverListParams) =>
        orgRequest<PageResponse<Driver>>(`/org/drivers${qs(params)}`),
      listDeleted: (params?: DriverListParams) =>
        orgRequest<PageResponse<Driver>>(`/org/drivers/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<Driver>(`/org/drivers/${id}`),
      create: (data: DriverUpsertPayload) =>
        orgRequest<Driver>('/org/drivers', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: DriverUpsertPayload) =>
        orgRequest<Driver>(`/org/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      setPin: (id: string, pin: string) =>
        orgRequest<Driver>(`/org/drivers/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }),
      clearPin: (id: string) =>
        orgRequest<Driver>(`/org/drivers/${id}/pin`, { method: 'DELETE' }),
      remove: (id: string) =>
        orgRequest<void>(`/org/drivers/${id}`, { method: 'DELETE' }),
      restore: (id: string) =>
        orgRequest<Driver>(`/org/drivers/${id}/restore`, { method: 'POST' }),
    },
    stops: {
      list: (params?: StopListParams) =>
        orgRequest<PageResponse<Stop>>(`/org/stops${qs(params)}`),
      listDeleted: (params?: StopListParams) =>
        orgRequest<PageResponse<Stop>>(`/org/stops/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<Stop>(`/org/stops/${id}`),
      create: (data: StopUpsertPayload) =>
        orgRequest<Stop>('/org/stops', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: StopUpsertPayload) =>
        orgRequest<Stop>(`/org/stops/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (id: string) =>
        orgRequest<void>(`/org/stops/${id}`, { method: 'DELETE' }),
      restore: (id: string) =>
        orgRequest<Stop>(`/org/stops/${id}/restore`, { method: 'POST' }),
      assignStudent: (studentId: string, data: { stop_id: string; service_window?: "AM" | "PM"; is_active?: boolean }) =>
        orgRequest<{ student_id: string; stop_id: string; service_window: "AM" | "PM"; is_active: boolean }>(
          `/org/students/${studentId}/stop-assignment`,
          { method: 'PUT', body: JSON.stringify(data) }
        ),
    },
    routes: {
      list: (params?: RouteListParams) =>
        orgRequest<PageResponse<Route>>(`/org/routes${qs(params)}`),
      listDeleted: (params?: RouteListParams) =>
        orgRequest<PageResponse<Route>>(`/org/routes/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<{ route: Route; stops: unknown[]; students: unknown[] }>(`/org/routes/${id}`),
      update: (id: string, data: Partial<Route>) =>
        orgRequest<Route>(`/org/routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (id: string) =>
        orgRequest<void>(`/org/routes/${id}`, { method: 'DELETE' }),
      restore: (id: string) =>
        orgRequest<Route>(`/org/routes/${id}/restore`, { method: 'POST' }),
      listAssignments: () =>
        orgRequest<{ items: Array<{ id: string; driver_id: string; vehicle_id: string; is_active: boolean; created_at: string; updated_at: string }> }>('/org/driver-vehicle-assignments'),
      upsertAssignment: (data: { driver_id: string; vehicle_id: string; is_active?: boolean }) =>
        orgRequest<{ id: string; driver_id: string; vehicle_id: string; is_active: boolean }>('/org/driver-vehicle-assignments', { method: 'POST', body: JSON.stringify(data) }),
    },
    plannerRuns: {
      list: (params?: { page?: number; per_page?: number }) =>
        orgRequest<PageResponse<PlannerRun>>(`/org/planner-runs${qs(params)}`),
      get: (id: string) =>
        orgRequest<{ run: PlannerRun; routes: Route[]; issues: PlannerIssue[] }>(`/org/planner-runs/${id}`),
      create: (data: { mode: "FASTEST_TIME" | "FEWEST_BUSES"; service_window: "PM" }) =>
        orgRequest<{ run: PlannerRun; issues: PlannerIssue[] }>('/org/planner-runs', { method: 'POST', body: JSON.stringify(data) }),
      publish: (id: string) =>
        orgRequest<PlannerRun>(`/org/planner-runs/${id}/publish`, { method: 'POST' }),
    },
    support: {
      listTickets: (params?: { status?: SupportTicketStatus; page?: number; per_page?: number }) =>
        orgRequest<PageResponse<SupportTicket>>(`/org/support/tickets${qs(params)}`),
      createTicket: (data: { subject: string; body: string }) =>
        orgRequest<{ ticket: SupportTicket; message: SupportMessage }>('/org/support/tickets', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      getTicket: (id: string) =>
        orgRequest<SupportTicket>(`/org/support/tickets/${id}`),
      listMessages: (id: string) =>
        orgRequest<SupportMessage[]>(`/org/support/tickets/${id}/messages`),
      sendMessage: (id: string, body: string) =>
        orgRequest<{ ticket: SupportTicket; message: SupportMessage }>(`/org/support/tickets/${id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
    },
  },
}
