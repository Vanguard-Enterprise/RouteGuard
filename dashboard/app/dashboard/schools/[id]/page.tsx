import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getSchool(id: string) {
  try {
    return await api.schools.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

export default async function SchoolDetailPage({ params }: PageProps) {
  const { id } = await params
  const school = await getSchool(id)
  if (!school) notFound()

  const fields: { label: string; value: string }[] = [
    { label: 'ID', value: school.id },
    { label: 'Name', value: school.name },
    { label: 'Address', value: school.address ?? '—' },
    { label: 'City', value: school.city ?? '—' },
    { label: 'State', value: school.state ?? '—' },
    { label: 'ZIP', value: school.zip ?? '—' },
    { label: 'Phone', value: school.phone ?? '—' },
    { label: 'Contact', value: school.contact_name ?? '—' },
    { label: 'Contact Email', value: school.contact_email ?? '—' },
    { label: 'Latitude', value: school.lat != null ? String(school.lat) : '—' },
    { label: 'Longitude', value: school.lng != null ? String(school.lng) : '—' },
    { label: 'Created', value: new Date(school.created_at).toLocaleString() },
    { label: 'Updated', value: new Date(school.updated_at).toLocaleString() },
  ]

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/schools"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {school.name}
          </h1>
        </div>
        <Link
          href={`/dashboard/schools/${school.id}/edit`}
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
            <span className="w-32 text-sm text-gray-500 shrink-0">{label}</span>
            <span className="text-sm text-gray-900 font-medium break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
