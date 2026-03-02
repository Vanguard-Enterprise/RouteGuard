import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DriverForm from '@/components/dashboard/driver-form'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getDriver(id: string) {
  try {
    return await api.drivers.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

export default async function EditDriverPage({ params }: PageProps) {
  const { id } = await params
  const driver = await getDriver(id)
  if (!driver) notFound()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/dashboard/drivers/${id}`}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Edit Driver
        </h1>
      </div>
      <DriverForm driver={driver} mode="edit" />
    </div>
  )
}
