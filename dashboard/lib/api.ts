const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const AUTH_BASE = ''

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

async function platformRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window !== 'undefined') {
    // Client-side: proxy through Next.js to forward the cookie
    return clientRequest<T>(`/api${path}`, init)
  }
  // Server-side: direct call with cookie forwarding
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
      create: (data: { email: string; name: string; org_id?: string }) =>
        platformRequest<PlatformUser>('/platform/users', { method: 'POST', body: JSON.stringify(data) }),
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
}
