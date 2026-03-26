const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const INTERNAL_API_BASE = process.env.INTERNAL_API_URL ?? PUBLIC_API_BASE
const AUTH_BASE = ''

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = typeof window === 'undefined' ? INTERNAL_API_BASE : PUBLIC_API_BASE
  const reqHeaders: Record<string, string> = {}

  if (!(init?.body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json'
  }

  if (typeof window === 'undefined') {
    try {
      const { cookies } = await import('next/headers')
      const cookieStore = await cookies()
      const session = cookieStore.get('rg_session')
      if (session) {
        reqHeaders['Cookie'] = `rg_session=${session.value}`
      }
    } catch {
      // Not in a Next.js server context
    }
  }

  const res = await fetch(`${apiBase}${path}`, {
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

async function platformRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window !== 'undefined') {
    // Client-side: proxy through Next.js to forward the cookie
    return clientRequest<T>(`/api${path}`, init)
  }
  // Server-side: direct call with cookie forwarding
  return request<T>(path, init)
}

async function orgRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window !== 'undefined') {
    return clientRequest<T>(`/api${path}`, init)
  }
  return request<T>(path, init)
}

async function clientRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
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

function qs(params?: Record<string, unknown>): string {
  if (!params) return ''
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      filtered[k] = String(v)
    }
  }
  const s = new URLSearchParams(filtered).toString()
  return s ? `?${s}` : ''
}

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

export interface Organization {
  id: string
  name: string
  slug: string
  is_platform: boolean
  suspended_at: string | null
  deleted_at: string | null
  member_count?: number
  created_at: string
  updated_at: string
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
  page?: number
  per_page?: number
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

// API methods
export const api = {
  auth: {
    lookup: (email: string) =>
      request<AuthMethodsResponse>('/auth/lookup', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    login: (email: string, password: string) =>
      authRequest<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    consumeMagicLink: (token: string) =>
      authRequest<void>('/api/auth/magic-link/consume', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    logout: () => authRequest<void>('/api/auth/logout', { method: 'POST' }),
    me: () => request<MeResponse>('/auth/me'),
    switchOrg: (orgId: string) => {
      if (typeof window !== 'undefined') {
        return clientRequest<{ org: OrgOption; permissions: string[] }>('/api/auth/switch-org', {
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
        return clientRequest<OrgOption[]>('/api/auth/orgs')
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
    students: {
      list: (params?: StudentListParams) =>
        orgRequest<PageResponse<Student>>(`/org/students${qs(params)}`),
      listDeleted: (params?: StudentListParams) =>
        orgRequest<PageResponse<Student>>(`/org/students/deleted${qs(params)}`),
      get: (id: string) =>
        orgRequest<Student>(`/org/students/${id}`),
      create: (data: StudentUpsertPayload) =>
        orgRequest<Student>('/org/students', { method: 'POST', body: JSON.stringify(data) }),
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
  },
}
