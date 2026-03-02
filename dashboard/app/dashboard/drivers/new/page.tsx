import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DriverForm from '@/components/dashboard/driver-form'

export const metadata = {
  title: 'New Driver — RouteGuard',
}

export default function NewDriverPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/drivers"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          New Driver
        </h1>
      </div>
      <DriverForm mode="create" />
    </div>
  )
}
