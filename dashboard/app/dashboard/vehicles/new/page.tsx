import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import VehicleForm from '@/components/dashboard/vehicle-form'

export const metadata = {
  title: 'New Vehicle — RouteGuard',
}

export default function NewVehiclePage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/vehicles"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          New Vehicle
        </h1>
      </div>
      <VehicleForm mode="create" />
    </div>
  )
}
