'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, APIError } from '@/lib/api'
import SSOButton from './sso-button'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface SSOConnection {
  id: string
  display_name: string
  type: string
}

interface OrgLoginFormProps {
  orgName: string
  slug: string
  hasPasswordAuth: boolean
  ssoConnections: SSOConnection[]
}

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

export default function OrgLoginForm({ orgName, slug, hasPasswordAuth, ssoConnections }: OrgLoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormValues) {
    setServerError(null)
    setLoading(true)
    try {
      await api.auth.login(data.email, data.password)
      window.location.href = '/dashboard'
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        setServerError('Invalid credentials. Please try again.')
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSSOClick(connectionId: string) {
    window.location.href = `${API_BASE}/auth/sso/${slug}/init?connection_id=${connectionId}`
  }

  const hasSSOConnections = ssoConnections.length > 0

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-xl shadow-lg px-8 py-10">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {orgName}
          </span>
          <p className="mt-1 text-sm text-gray-500">Sign in to continue</p>
        </div>

        {hasSSOConnections && (
          <div className="space-y-2 mb-4">
            {ssoConnections.map((conn) => (
              <SSOButton
                key={conn.id}
                displayName={conn.display_name}
                onClick={() => handleSSOClick(conn.id)}
              />
            ))}
          </div>
        )}

        {hasSSOConnections && hasPasswordAuth && (
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-400">
              <span className="bg-white px-2">or continue with email</span>
            </div>
          </div>
        )}

        {hasPasswordAuth && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="••••••••"
              />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {serverError && (
              <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {!hasPasswordAuth && !hasSSOConnections && (
          <p className="text-sm text-gray-500 text-center">
            Contact your administrator for login instructions.
          </p>
        )}
      </div>
    </div>
  )
}
