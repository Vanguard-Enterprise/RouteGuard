'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, type AuthMethodsResponse, type SSOOption } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type Step = 'email' | 'auth' | 'org-select'

interface OrgOption {
  id: string
  name: string
  slug: string
  is_platform: boolean
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [authMethods, setAuthMethods] = useState<AuthMethodsResponse | null>(null)
  const [orgs, setOrgs] = useState<OrgOption[]>([])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    try {
      const methods = await api.auth.lookup(email.trim())
      setAuthMethods(methods)

      if (!methods.has_password && (!methods.sso_options || methods.sso_options.length === 0)) {
        toast.error('No account found for this email.')
        return
      }

      setStep('auth')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return

    setLoading(true)
    try {
      const result = await api.auth.login(email.trim(), password)

      if (result.orgs.length === 1) {
        router.push('/dashboard')
        return
      }

      setOrgs(result.orgs)
      setStep('org-select')
    } catch {
      toast.error('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOrgSelect(orgId: string) {
    setLoading(true)
    try {
      await api.auth.switchOrg(orgId)
      router.push('/dashboard')
    } catch {
      toast.error('Failed to select organization.')
      setLoading(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleSSOClick(_sso: SSOOption) {
    toast.error('SSO login is not yet available.')
  }

  function handleBack() {
    setStep('email')
    setPassword('')
    setAuthMethods(null)
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {step === 'email' && 'Welcome back'}
            {step === 'auth' && 'Sign in'}
            {step === 'org-select' && 'Choose organization'}
          </CardTitle>
          <CardDescription>
            {step === 'email' && 'Enter your email to continue'}
            {step === 'auth' && email}
            {step === 'org-select' && 'Select which organization to sign into'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </Field>
                <Field>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Checking...' : 'Continue'}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}

          {step === 'auth' && (
            <FieldGroup>
              {authMethods?.sso_options && authMethods.sso_options.length > 0 && (
                <Field>
                  {authMethods.sso_options.map(sso => (
                    <Button
                      key={sso.connection_id}
                      variant="outline"
                      type="button"
                      onClick={() => handleSSOClick(sso)}
                      disabled={loading}
                    >
                      Sign in with {sso.display_name}
                    </Button>
                  ))}
                </Field>
              )}

              {authMethods?.has_password && authMethods?.sso_options && authMethods.sso_options.length > 0 && (
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                  Or continue with
                </FieldSeparator>
              )}

              {authMethods?.has_password && (
                <form onSubmit={handlePasswordSubmit}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoFocus
                        required
                      />
                    </Field>
                    <Field>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign in'}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              )}

              <Field>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Use a different email
                </Button>
              </Field>
            </FieldGroup>
          )}

          {step === 'org-select' && (
            <FieldGroup>
              <Field>
                {orgs.map(org => (
                  <Button
                    key={org.id}
                    variant="outline"
                    className="justify-start"
                    onClick={() => handleOrgSelect(org.id)}
                    disabled={loading}
                  >
                    {org.name}
                  </Button>
                ))}
              </Field>
            </FieldGroup>
          )}
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our{' '}
        <a href="/terms">Terms of Service</a> and{' '}
        <a href="/privacy">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
