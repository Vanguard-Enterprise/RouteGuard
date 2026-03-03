import { redirect } from 'next/navigation'
import { api, APIError, type User } from '@/lib/api'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AdminAppSidebar } from '@/components/admin/admin-app-sidebar'
import { AdminSiteHeader } from '@/components/admin/admin-site-header'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user: User | null = null
  try {
    user = await api.admin.profile.get()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    redirect('/staff/login')
  }
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
      <AdminAppSidebar user={user} variant="inset" />
      <SidebarInset>
        <AdminSiteHeader />
        <div className="flex flex-1 flex-col">
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
