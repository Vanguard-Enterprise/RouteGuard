import { APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import { api } from '@/lib/api'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import UsersManagement from '@/components/dashboard/users-management'

async function checkAuth() {
  try {
    await api.auth.me()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
  }
}

export const metadata = {
  title: 'Users — Settings — RouteGuard',
}

export default async function UsersSettingsPage() {
  await checkAuth()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/settings"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Users
        </h1>
      </div>
      <UsersManagement />
    </div>
  )
}
