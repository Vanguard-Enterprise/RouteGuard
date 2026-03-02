import { redirect } from 'next/navigation'
import { api, APIError, User } from '@/lib/api'
import AppSidebar from '@/components/dashboard/app-sidebar'
import DashboardHeader from '@/components/dashboard/header'

async function getUser(): Promise<User | null> {
  try {
    return await api.auth.me()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) return null
    throw err
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) {
    redirect('/staff/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AppSidebar user={user} />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <DashboardHeader user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
