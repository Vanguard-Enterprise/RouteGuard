import { cookies } from 'next/headers'
import type { User } from './api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// Fetches the authenticated user server-side by forwarding the session cookie
// from the incoming request to the API. Use this in server components / layouts.
export async function getServerUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('rg_session')
  if (!session) return null

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Cookie: `rg_session=${session.value}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
