import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import RouteForm from '@/components/dashboard/route-form'

export const metadata = {
  title: 'New Route — RouteGuard',
}

export default function NewRoutePage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/routes"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          New Route
        </h1>
      </div>
      <RouteForm mode="create" />
    </div>
  )
}
