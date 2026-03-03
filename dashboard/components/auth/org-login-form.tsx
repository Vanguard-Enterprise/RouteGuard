'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, APIError } from '@/lib/api'
import SSOButton from './sso-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{orgName}</CardTitle>
        <CardDescription>Sign in to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {hasSSOConnections && (
            <Field>
              {ssoConnections.map((conn) => (
                <SSOButton
                  key={conn.id}
                  displayName={conn.display_name}
                  onClick={() => handleSSOClick(conn.id)}
                />
              ))}
            </Field>
          )}
          {hasSSOConnections && hasPasswordAuth && (
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
              or continue with email
            </FieldSeparator>
          )}
          {hasPasswordAuth && (
            <form onSubmit={handleSubmit(onSubmit)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email address</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="..."
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
                  )}
                </Field>
                {serverError && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    {serverError}
                  </div>
                )}
                <Field>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
          {!hasPasswordAuth && !hasSSOConnections && (
            <p className="text-sm text-muted-foreground text-center">
              Contact your administrator for login instructions.
            </p>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
