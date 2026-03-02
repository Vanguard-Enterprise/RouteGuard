import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import VehicleForm from '@/components/dashboard/vehicle-form'

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

export default async function EditVehiclePage({ params }: PageProps) {
  const { id } = await params
  const vehicle = await getVehicle(id)
  if (!vehicle) notFound()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/dashboard/vehicles/${id}`}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Edit Vehicle
        </h1>
      </div>
      <VehicleForm vehicle={vehicle} mode="edit" />
    </div>
  )
}
