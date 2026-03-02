import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import SSOManagement from '@/components/dashboard/sso-management'

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
  title: 'SSO — Settings — RouteGuard',
}

export default async function SSOPage() {
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
          SSO Connections
        </h1>
      </div>
      <SSOManagement />
    </div>
  )
}
