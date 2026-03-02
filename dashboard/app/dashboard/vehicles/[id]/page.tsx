import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getVehicle(id: string) {
  try {
    return await api.vehicles.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    maintenance: 'bg-amber-100 text-amber-700',
    retired: 'bg-red-100 text-red-700',
  }
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}
    >
      {status}
    </span>
  )
}

export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params
  const vehicle = await getVehicle(id)
  if (!vehicle) notFound()

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/vehicles"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {vehicle.name}
          </h1>
        </div>
        <Link
          href={`/dashboard/vehicles/${vehicle.id}/edit`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">ID</span>
          <span className="text-sm text-gray-900 font-medium font-mono break-all">{vehicle.id}</span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Name</span>
          <span className="text-sm text-gray-900 font-medium">{vehicle.name}</span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Number</span>
          <span className="text-sm text-gray-900 font-medium">{vehicle.number ?? '—'}</span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Year</span>
          <span className="text-sm text-gray-900 font-medium">
            {vehicle.year != null ? vehicle.year : '—'}
          </span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Make</span>
          <span className="text-sm text-gray-900 font-medium">{vehicle.make ?? '—'}</span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Model</span>
          <span className="text-sm text-gray-900 font-medium">{vehicle.model ?? '—'}</span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Capacity</span>
          <span className="text-sm text-gray-900 font-medium">
            {vehicle.capacity != null ? vehicle.capacity : '—'}
          </span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">VIN</span>
          <span className="text-sm text-gray-900 font-medium font-mono">
            {vehicle.vin ?? '—'}
          </span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">License Plate</span>
          <span className="text-sm text-gray-900 font-medium">{vehicle.license_plate ?? '—'}</span>
        </div>
        <div className="flex items-center px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Status</span>
          <StatusBadge status={vehicle.status} />
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Created</span>
          <span className="text-sm text-gray-900 font-medium">
            {new Date(vehicle.created_at).toLocaleString()}
          </span>
        </div>
        <div className="flex px-5 py-3">
          <span className="w-32 text-sm text-gray-500 shrink-0">Updated</span>
          <span className="text-sm text-gray-900 font-medium">
            {new Date(vehicle.updated_at).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
