import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import DriverDetailActions from '@/components/dashboard/driver-detail-actions'

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

function maskLast4(value: string | null): string {
  if (!value) return '—'
  if (value.length <= 4) return '•'.repeat(value.length)
  return '••••' + value.slice(-4)
}

export default async function DriverDetailPage({ params }: PageProps) {
  const { id } = await params
  const driver = await getDriver(id)
  if (!driver) notFound()

  const fields: { label: string; value: string }[] = [
    { label: 'ID', value: driver.id },
    { label: 'First Name', value: driver.first_name },
    { label: 'Last Name', value: driver.last_name },
    { label: 'Phone', value: driver.phone ?? '—' },
    { label: 'License #', value: maskLast4(driver.license_number) },
    {
      label: 'License Expiry',
      value: driver.license_expiry
        ? new Date(driver.license_expiry).toLocaleDateString()
        : '—',
    },
    { label: 'RFID Badge', value: driver.rfid_badge_id ? '••••••••' : '—' },
    { label: 'Status', value: driver.status },
    { label: 'Created', value: new Date(driver.created_at).toLocaleString() },
    { label: 'Updated', value: new Date(driver.updated_at).toLocaleString() },
  ]

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/drivers"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {driver.first_name} {driver.last_name}
          </h1>
        </div>
        <DriverDetailActions driverId={driver.id} />
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
