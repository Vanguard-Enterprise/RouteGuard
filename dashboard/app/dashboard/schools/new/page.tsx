import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import SchoolForm from '@/components/dashboard/school-form'

export const metadata = {
  title: 'New School — RouteGuard',
}

export default function NewSchoolPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/schools"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          New School
        </h1>
      </div>
      <SchoolForm mode="create" />
    </div>
  )
}
