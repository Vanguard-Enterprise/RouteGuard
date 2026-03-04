import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const apiRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await apiRes.json().catch(() => ({ error: 'Login failed' }))

  if (!apiRes.ok) {
    return NextResponse.json(data, { status: apiRes.status })
  }

  const setCookie = apiRes.headers.get('set-cookie')
  const response = NextResponse.json(data)

  const cookieOpts = {
    path: '/',
    domain: 'route-guard.com',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7,
  }

  if (setCookie) {
    const match = setCookie.match(/rg_session=([^;]+)/)
    if (match) {
      response.cookies.set('rg_session', match[1], cookieOpts)
      response.cookies.set('rg_user_type', data.is_staff ? 'staff' : 'org', cookieOpts)
    }
  }

  return response
}
