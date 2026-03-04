import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cookies } from 'next/headers'

interface PageProps {
  searchParams: Promise<{ from?: string }>
}

export default async function ForbiddenPage({ searchParams }: PageProps) {
  const { from } = await searchParams
  const cookieStore = await cookies()
  const userType = cookieStore.get('rg_user_type')?.value

  let href = '/'
  let label = 'Go Home'
  if (from === 'admin' || userType === 'org') {
    href = '/dashboard'
    label = 'Go to Dashboard'
  } else if (from === 'dashboard' || userType === 'staff') {
    href = '/admin'
    label = 'Go to Admin'
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <ShieldOff className="h-12 w-12 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Access Denied</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to view this page.
          </p>
        </div>
        <Button asChild>
          <Link href={href}>{label}</Link>
        </Button>
      </div>
    </div>
  )
}
