import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'

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

      {users.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-gray-500 text-sm mb-4">No users yet. Add the first admin user to get this org started.</p>
          <Link
            href={`/admin/organizations/${id}/users/new`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            <UserPlus size={14} />
            Add First User
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {users.map((user) => (
            <div key={user.id} className="flex items-center px-5 py-3 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-sm text-gray-500 truncate">{user.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">
                  {user.last_login_at
                    ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}`
                    : 'Never logged in'}
                </p>
                <p className="text-xs text-gray-400">
                  Added {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
