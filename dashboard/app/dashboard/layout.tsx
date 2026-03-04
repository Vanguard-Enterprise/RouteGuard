import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/server-api'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { DashboardAppSidebar } from '@/components/dashboard/dashboard-app-sidebar'
import { DashboardSiteHeader } from '@/components/dashboard/dashboard-site-header'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) {
    redirect('/staff/login')
  }

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': 'calc(var(--spacing) * 64)',
        '--header-height': 'calc(var(--spacing) * 14)',
      } as React.CSSProperties}
    >
      <DashboardAppSidebar user={user} variant="inset" />
      <SidebarInset>
        <DashboardSiteHeader orgId={user.org_id ?? ''} />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
