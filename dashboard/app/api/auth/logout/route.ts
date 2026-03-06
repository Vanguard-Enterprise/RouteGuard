import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get('rg_session')

  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: cookie ? { Cookie: `rg_session=${cookie.value}` } : {},
  })

  const response = new NextResponse(null, { status: 204 })

  // Clear the cookie
  response.cookies.set('rg_session', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  return response
}
