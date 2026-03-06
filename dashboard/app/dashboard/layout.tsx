import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/server-api'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await getServerUser()
  if (!me) redirect('/login')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold">RouteGuard</span>
            <OrgSwitcher
              currentOrg={me.active_org}
              userName={me.user.name}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{me.user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Sign out
      </button>
    </form>
  )
}
