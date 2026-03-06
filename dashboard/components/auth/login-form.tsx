'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, type AuthMethodsResponse, type SSOOption } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Step = 'email' | 'auth' | 'org-select'

interface OrgOption {
  id: string
  name: string
  slug: string
  is_platform: boolean
}

export function LoginForm() {
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

  function handleSSOClick(_sso: SSOOption) {
    // SSO handlers are not yet implemented - placeholder for OIDC/SAML init
    toast.error('SSO login is not yet available.')
  }

  function handleBack() {
    setStep('email')
    setPassword('')
    setAuthMethods(null)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
        <CardDescription>
          {step === 'email' && 'Enter your email to continue.'}
          {step === 'auth' && email}
          {step === 'org-select' && 'Select an organization.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Checking...' : 'Continue'}
            </Button>
          </form>
        )}

        {step === 'auth' && (
          <div className="space-y-4">
            {authMethods?.has_password && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>
            )}

            {authMethods?.sso_options && authMethods.sso_options.length > 0 && (
              <>
                {authMethods.has_password && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {authMethods.sso_options.map(sso => (
                    <Button
                      key={sso.connection_id}
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSSOClick(sso)}
                      disabled={loading}
                    >
                      Sign in with {sso.display_name}
                    </Button>
                  ))}
                </div>
              </>
            )}

            <Button
              variant="ghost"
              className="w-full"
              onClick={handleBack}
              disabled={loading}
            >
              Back
            </Button>
          </div>
        )}

        {step === 'org-select' && (
          <div className="space-y-2">
            {orgs.map(org => (
              <Button
                key={org.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleOrgSelect(org.id)}
                disabled={loading}
              >
                {org.name}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
