import { redirect } from 'next/navigation'
import { User } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import AppSidebar from '@/components/dashboard/app-sidebar'
import DashboardHeader from '@/components/dashboard/header'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user: User | null = await getServerUser()
  if (!user) {
    redirect('/staff/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AppSidebar user={user} />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <DashboardHeader user={user} orgId={user.org_id ?? ''} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
