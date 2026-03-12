import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const cookie = request.cookies.get('rg_session')
  if (cookie) {
    headers['Cookie'] = `rg_session=${cookie.value}`
  }

  const res = await fetch(`${API_BASE}/auth/switch-org`, {
    method: 'POST',
    headers,
    body,
  })

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 })
  }
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
