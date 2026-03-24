import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const response = NextResponse.next()

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  const isDev = process.env.NODE_ENV === 'development'
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
  const wsUrl = apiUrl.startsWith('https://')
    ? `wss://${apiUrl.slice('https://'.length)}`
    : apiUrl.startsWith('http://')
      ? `ws://${apiUrl.slice('http://'.length)}`
      : apiUrl

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    isDev
      ? "connect-src 'self' http://localhost:* ws://localhost:*"
      : `connect-src 'self' ${apiUrl} ${wsUrl}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)

  // Soft auth redirect for protected routes
  const session = request.cookies.get('rg_session')
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
