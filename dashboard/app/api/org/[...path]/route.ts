import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const target = `/org/${path.join('/')}`
  const url = `${API_BASE}${target}${request.nextUrl.search}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const cookie = request.cookies.get('rg_session')
  if (cookie) {
    headers['Cookie'] = `rg_session=${cookie.value}`
  }

  const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.text()
    : undefined

  const res = await fetch(url, {
    method: request.method,
    headers,
    body,
  })

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 })
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
export const PATCH = proxyRequest
