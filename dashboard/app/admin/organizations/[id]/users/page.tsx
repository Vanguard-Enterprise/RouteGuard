import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { OrgUsersTable } from '@/components/admin/org-users-table'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getOrg(id: string) {
  try {
    return await api.admin.organizations.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

async function getUsers(id: string) {
  try {
    return await api.admin.organizations.users.list(id)
  } catch {
    return []
  }
}

export default async function OrgUsersPage({ params }: PageProps) {
  const { id } = await params
  const [org, users] = await Promise.all([getOrg(id), getUsers(id)])
  if (!org) notFound()

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/organizations/${id}`}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {org.name} - Users
          </h1>
        </div>
        <Link
          href={`/admin/organizations/${id}/users/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <UserPlus size={14} />
          Add User
        </Link>
      </div>

      <OrgUsersTable orgId={id} initialUsers={users} />
    </div>
  )
}
