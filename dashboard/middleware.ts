import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  const isDev = process.env.NODE_ENV === 'development'

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://api.mapbox.com",
    "worker-src blob:",
    "img-src 'self' data: blob: https://*.mapbox.com https://*.mapbox.cn",
    isDev
      ? "connect-src 'self' http://localhost:* ws://localhost:* https://*.mapbox.com"
      : "connect-src 'self' https://api.route-guard.com wss://api.route-guard.com https://*.mapbox.com",
    "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
    "font-src 'self' data:",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)

  // Soft auth redirect for protected routes without a session cookie
  const session = request.cookies.get('rg_session')
  const { pathname } = request.nextUrl
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) && !session) {
    return NextResponse.redirect(new URL('/staff/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
}
