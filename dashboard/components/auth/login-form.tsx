'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { saveDemoSession } from '@/lib/demo-session-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup } from '@/components/ui/field'

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const router = useRouter()

  function enterDemo() {
    saveDemoSession('demo@route-guard.local', 'RouteGuard Demo')
    router.push('/dashboard')
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">RouteGuard Demo</CardTitle>
          <CardDescription>Authentication has been removed now that E^2 has ended.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <p className="text-center text-sm text-muted-foreground">
              This school project is preserved here as an interactive demo.
            </p>
            <Field>
              <Button type="button" onClick={enterDemo}>Enter demo</Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  )
}
