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
      filtered[k] = Array.isArray(v) ? v.join(',') : String(v)
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
  created_at: string
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
      createRelease: (data: { version: string; release_date: string; release_notes?: string }) =>
        platformRequest<SoftwareRelease>('/platform/updates/releases', { method: 'POST', body: JSON.stringify(data) }),
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
