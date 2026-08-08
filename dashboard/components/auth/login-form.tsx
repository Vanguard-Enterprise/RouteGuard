'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { saveDemoSession } from '@/lib/demo-session-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const router = useRouter()
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = identity.trim()
    if (!value) return
    const name = value.includes('@')
      ? value.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
      : value
    saveDemoSession(value, name || 'Demo User')
    router.push('/dashboard')
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Explore RouteGuard</CardTitle>
          <CardDescription>Use any name, email, and password to enter the local demo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="identity">Name or email</FieldLabel>
                <Input id="identity" type="text" placeholder="student@example.com" value={identity} onChange={(event) => setIdentity(event.target.value)} autoFocus required />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" type="password" placeholder="Anything is accepted" value={password} onChange={(event) => setPassword(event.target.value)} />
              </Field>
              <Field>
                <Button type="submit">Enter demo</Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        This is a local, credential-free school project demo. No account or external service is contacted.
      </FieldDescription>
    </div>
  )
}
