// dashboard/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
// Auth routes are proxied through Next.js so the session cookie is set
// from route-guard.com directly, avoiding cross-origin cookie restrictions.
const AUTH_BASE = ''

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const reqHeaders: Record<string, string> = {}

  if (!(init?.body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json'
  }

  // In server context, forward the session cookie from the incoming request.
  // Dynamic import keeps next/headers out of the client bundle.
  if (typeof window === 'undefined') {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      const session = cookieStore.get('rg_session')
      if (session) {
        reqHeaders['Cookie'] = `rg_session=${session.value}`
      }
    } catch {
      // Not in a Next.js server context — skip
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...reqHeaders,
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new APIError(res.status, body.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ============================================================
// Domain Types (matching Go domain/types.go)
// ============================================================

export interface User {
  id: string
  org_id: string | null
  email: string
  name: string
  avatar_url: string | null
  last_login_at: string | null
  permissions: string[]
  created_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  type: string
  logo_url: string | null
  timezone: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface School {
  id: string
  org_id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  contact_name: string | null
  contact_email: string | null
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  org_id: string
  school_id: string
  first_name: string
  last_name: string
  student_number: string | null
  grade: string | null
  rfid_tag_id: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  status: string
  medical_notes: string | null
  created_at: string
  updated_at: string
}

export interface Guardian {
  id: string
  org_id: string
  first_name: string
  last_name: string
  phone: string
  alt_phone: string | null
  email: string | null
  sms_opt_in: boolean
  language: string
  created_at: string
}

export interface Driver {
  id: string
  org_id: string
  user_id: string | null
  first_name: string
  last_name: string
  phone: string | null
  license_number: string | null
  license_expiry: string | null
  rfid_badge_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  org_id: string
  name: string
  number: string | null
  capacity: number | null
  year: number | null
  make: string | null
  model: string | null
  vin: string | null
  license_plate: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Route {
  id: string
  org_id: string
  name: string
  type: string
  status: string
  description: string | null
  estimated_duration_min: number | null
  created_at: string
  updated_at: string
}

export interface Stop {
  id: string
  route_id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  sequence_order: number
  scheduled_time: string | null
  created_at: string
  updated_at: string
}

export interface RouteAssignment {
  id: string
  route_id: string
  vehicle_id: string
  driver_id: string
  effective_date: string | null
  end_date: string | null
  days_of_week: string
  created_at: string
}

export interface Trip {
  id: string
  route_assignment_id: string
  org_id: string
  date: string
  status: string
  started_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
}

export interface DailySummary {
  id: string
  org_id: string
  route_id: string
  date: string
  total_students: number
  boarded_count: number
  on_time: boolean
  delay_minutes: number | null
  notes: string | null
  created_at: string
}

export interface OrgRole {
  id: string
  org_id: string
  name: string
  permissions: string[]
  is_system: boolean
  created_at: string
}

export interface APIKey {
  id: string
  org_id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface Device {
  id: string
  org_id: string
  serial: string
  status: string
  vehicle_id: string | null
  seat_count: number | null
  bus_layout: Record<string, unknown>
  provisioned_at: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_type: string
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// ============================================================
// API Methods
// ============================================================

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new APIError(res.status, body.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  auth: {
    login: (email: string, password: string, orgSlug?: string) =>
      authRequest<User>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(orgSlug ? { org_slug: orgSlug } : {}) }),
      }),
    logout: () => authRequest<void>('/api/auth/logout', { method: 'POST' }),
    me: () => request<User>('/auth/me'),
  },
  admin: {
    organizations: {
      list: () => request<Organization[]>('/admin/organizations'),
      get: (id: string) => request<Organization>(`/admin/organizations/${id}`),
      create: (data: Partial<Organization>) =>
        request<Organization>('/admin/organizations', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<Organization>) =>
        request<Organization>(`/admin/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/admin/organizations/${id}`, { method: 'DELETE' }),
    },
    devices: {
      list: () => request<Device[]>('/admin/devices'),
      create: (data: { serial: string }) =>
        request<{ device_id: string; serial: string; provisioning_token: string; expires_at: string }>(
          '/admin/devices',
          { method: 'POST', body: JSON.stringify(data) },
        ),
      update: (id: string, data: Partial<Device>) =>
        request<Device>(`/admin/devices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/admin/devices/${id}`, { method: 'DELETE' }),
    },
    auditLogs: {
      list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return request<AuditLog[]>(`/admin/audit-logs${qs}`)
      },
    },
    profile: {
      get: () => request<User>('/admin/profile'),
      update: (data: { name: string; avatar_url?: string | null }) =>
        request<User>('/admin/profile', { method: 'PATCH', body: JSON.stringify(data) }),
      changePassword: (data: { current_password: string; new_password: string }) =>
        request<void>('/admin/profile/password', { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  schools: {
    list: () => request<School[]>('/dashboard/schools'),
    get: (id: string) => request<School>(`/dashboard/schools/${id}`),
    create: (data: Partial<School>) =>
      request<School>('/dashboard/schools', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<School>) =>
      request<School>(`/dashboard/schools/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/dashboard/schools/${id}`, { method: 'DELETE' }),
  },
  students: {
    list: (params?: { limit?: number; offset?: number }) => {
      const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''
      return request<Student[]>(`/dashboard/students${qs}`)
    },
    get: (id: string) => request<Student>(`/dashboard/students/${id}`),
    create: (data: Partial<Student>) =>
      request<Student>('/dashboard/students', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Student>) =>
      request<Student>(`/dashboard/students/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/dashboard/students/${id}`, { method: 'DELETE' }),
    import: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<{ imported: number; errors: string[] }>('/dashboard/students/import', {
        method: 'POST',
        headers: {},
        body: form,
      })
    },
    guardians: {
      list: (studentId: string) => request<Guardian[]>(`/dashboard/students/${studentId}/guardians`),
      create: (studentId: string, data: Partial<Guardian>) =>
        request<Guardian>(`/dashboard/students/${studentId}/guardians`, { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  drivers: {
    list: () => request<Driver[]>('/dashboard/drivers'),
    get: (id: string) => request<Driver>(`/dashboard/drivers/${id}`),
    create: (data: Partial<Driver>) =>
      request<Driver>('/dashboard/drivers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Driver>) =>
      request<Driver>(`/dashboard/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/dashboard/drivers/${id}`, { method: 'DELETE' }),
    setPin: (id: string, pin: string) =>
      request<void>(`/dashboard/drivers/${id}/set-pin`, { method: 'POST', body: JSON.stringify({ pin }) }),
  },
  vehicles: {
    list: () => request<Vehicle[]>('/dashboard/vehicles'),
    get: (id: string) => request<Vehicle>(`/dashboard/vehicles/${id}`),
    create: (data: Partial<Vehicle>) =>
      request<Vehicle>('/dashboard/vehicles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Vehicle>) =>
      request<Vehicle>(`/dashboard/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/dashboard/vehicles/${id}`, { method: 'DELETE' }),
  },
  routes: {
    list: () => request<Route[]>('/dashboard/routes'),
    get: (id: string) => request<Route>(`/dashboard/routes/${id}`),
    create: (data: Partial<Route>) =>
      request<Route>('/dashboard/routes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Route>) =>
      request<Route>(`/dashboard/routes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/dashboard/routes/${id}`, { method: 'DELETE' }),
    stops: {
      list: (routeId: string) => request<Stop[]>(`/dashboard/routes/${routeId}/stops`),
      create: (routeId: string, data: Partial<Stop>) =>
        request<Stop>(`/dashboard/routes/${routeId}/stops`, { method: 'POST', body: JSON.stringify(data) }),
      update: (routeId: string, stopId: string, data: Partial<Stop>) =>
        request<Stop>(`/dashboard/routes/${routeId}/stops/${stopId}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (routeId: string, stopId: string) =>
        request<void>(`/dashboard/routes/${routeId}/stops/${stopId}`, { method: 'DELETE' }),
    },
    assignments: {
      list: (routeId: string) => request<RouteAssignment[]>(`/dashboard/routes/${routeId}/assignments`),
      create: (routeId: string, data: Partial<RouteAssignment>) =>
        request<RouteAssignment>(`/dashboard/routes/${routeId}/assignments`, { method: 'POST', body: JSON.stringify(data) }),
    },
    students: (routeId: string) => request<Student[]>(`/dashboard/routes/${routeId}/students`),
  },
  trips: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return request<Trip[]>(`/dashboard/trips${qs}`)
    },
    get: (id: string) => request<Trip>(`/dashboard/trips/${id}`),
    create: (data: Partial<Trip>) =>
      request<Trip>('/dashboard/trips', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Trip>) =>
      request<Trip>(`/dashboard/trips/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  reports: {
    dailySummaries: {
      list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return request<DailySummary[]>(`/dashboard/reports/daily-summaries${qs}`)
      },
      get: (id: string) => request<DailySummary>(`/dashboard/reports/daily-summaries/${id}`),
      upsert: (data: Partial<DailySummary>) =>
        request<DailySummary>('/dashboard/reports/daily-summaries', { method: 'POST', body: JSON.stringify(data) }),
    },
  },
  settings: {
    users: {
      list: () => request<User[]>('/dashboard/settings/users'),
      roles: {
        list: (userId: string) => request<OrgRole[]>(`/dashboard/settings/users/${userId}/roles`),
        assign: (userId: string, roleId: string) =>
          request<void>(`/dashboard/settings/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ role_id: roleId }) }),
        unassign: (userId: string, roleId: string) =>
          request<void>(`/dashboard/settings/users/${userId}/roles/${roleId}`, { method: 'DELETE' }),
      },
    },
    roles: {
      list: () => request<OrgRole[]>('/dashboard/settings/roles'),
      get: (id: string) => request<OrgRole>(`/dashboard/settings/roles/${id}`),
      create: (data: Partial<OrgRole>) =>
        request<OrgRole>('/dashboard/settings/roles', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Partial<OrgRole>) =>
        request<OrgRole>(`/dashboard/settings/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/dashboard/settings/roles/${id}`, { method: 'DELETE' }),
    },
    apiKeys: {
      list: () => request<APIKey[]>('/dashboard/settings/api-keys'),
      create: (name: string, scopes: string[]) =>
        request<{ api_key: APIKey; key: string }>('/dashboard/settings/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) }),
      delete: (id: string) => request<void>(`/dashboard/settings/api-keys/${id}`, { method: 'DELETE' }),
    },
    sso: {
      list: () => request<unknown[]>('/dashboard/settings/sso'),
      create: (data: unknown) =>
        request<unknown>('/dashboard/settings/sso', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: unknown) =>
        request<unknown>(`/dashboard/settings/sso/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/dashboard/settings/sso/${id}`, { method: 'DELETE' }),
    },
    auditLogs: {
      list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return request<AuditLog[]>(`/dashboard/audit-logs${qs}`)
      },
    },
  },
}
