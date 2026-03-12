import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {}
  const cookie = request.cookies.get('rg_session')
  if (cookie) {
    headers['Cookie'] = `rg_session=${cookie.value}`
  }

  const res = await fetch(`${API_BASE}/auth/orgs`, { headers })

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 })
  }
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
