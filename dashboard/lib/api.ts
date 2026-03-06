const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

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
