import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST() {
  const cookieStore = await cookies()
  const session = cookieStore.get('rg_session')

  if (session) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `rg_session=${session.value}` },
    }).catch(() => {})
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('rg_session', '', {
    path: '/',
    domain: 'route-guard.com',
    maxAge: 0,
  })
  return response
}
