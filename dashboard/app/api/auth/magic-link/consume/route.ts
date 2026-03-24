import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const res = await fetch(`${API_BASE}/auth/magic-link/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (res.status === 204) {
    const response = new NextResponse(null, { status: 204 })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      response.headers.set('set-cookie', setCookie)
    }
    return response
  }

  const data = await res.json().catch(() => ({}))
  const response = NextResponse.json(data, { status: res.status })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    response.headers.set('set-cookie', setCookie)
  }
  return response
}
