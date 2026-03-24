import { cookies } from 'next/headers'
import type { MeResponse } from './api'

const API_BASE = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function getServerUser(): Promise<MeResponse | null> {
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
