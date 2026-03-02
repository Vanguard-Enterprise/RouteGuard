import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ImportWizard from '@/components/dashboard/import-wizard'

export const metadata = {
  title: 'Import Students — RouteGuard',
}

export default function ImportStudentsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/students"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Import Students
        </h1>
      </div>
      <ImportWizard />
    </div>
  )
}
