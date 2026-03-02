import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, ArrowLeft } from 'lucide-react'

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

export default async function OrgDetailPage({ params }: PageProps) {
  const { id } = await params
  const org = await getOrg(id)
  if (!org) notFound()

  const fields: { label: string; value: string }[] = [
    { label: 'ID', value: org.id },
    { label: 'Name', value: org.name },
    { label: 'Slug', value: org.slug },
    { label: 'Type', value: org.type },
    { label: 'Timezone', value: org.timezone },
    { label: 'Created', value: new Date(org.created_at).toLocaleString() },
    { label: 'Updated', value: new Date(org.updated_at).toLocaleString() },
  ]

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/organizations"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {org.name}
          </h1>
        </div>
        <Link
          href={`/admin/organizations/${org.id}/edit`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex px-5 py-3">
            <span className="w-28 text-sm text-gray-500 shrink-0">{label}</span>
            <span className="text-sm text-gray-900 font-medium break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
