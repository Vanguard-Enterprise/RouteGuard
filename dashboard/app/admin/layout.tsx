import { redirect } from 'next/navigation'
import { api, APIError, User } from '@/lib/api'
import AdminSidebar from '@/components/admin/admin-sidebar'
import AdminHeader from '@/components/admin/admin-header'

async function getUser(): Promise<User | null> {
  try {
    return await api.auth.me()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      return null
    }
    return null
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) {
    redirect('/staff/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <AdminHeader user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
