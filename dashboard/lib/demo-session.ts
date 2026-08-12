import { cookies } from 'next/headers'
import type { AuthUser, MeResponse } from './api'
import { DEMO_ME } from './demo-session-data'

export const DEMO_SESSION_COOKIE = 'rg_demo_user'

function parseUser(value?: string): AuthUser | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<AuthUser>
    if (typeof parsed.email !== 'string' || typeof parsed.name !== 'string') return null
    return {
      id: typeof parsed.id === 'string' ? parsed.id : 'demo-user',
      email: parsed.email,
      name: parsed.name,
    }
  } catch {
    return null
  }
}

export async function getDemoUser(): Promise<MeResponse> {
  const cookieStore = await cookies()
  const user = parseUser(cookieStore.get(DEMO_SESSION_COOKIE)?.value)
  return user ? { ...DEMO_ME, user } : DEMO_ME
}
