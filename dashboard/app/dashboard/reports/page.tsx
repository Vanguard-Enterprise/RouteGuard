import Link from 'next/link'
import { BarChart3, Users, TrendingUp, Clock } from 'lucide-react'

export const metadata = {
  title: 'Reports — RouteGuard',
}

const reportCards = [
  {
    href: '/dashboard/reports/attendance',
    icon: Users,
    title: 'Attendance',
    description: 'View daily student boarding counts and attendance trends.',
  },
  {
    href: '/dashboard/reports/ridership',
    icon: TrendingUp,
    title: 'Ridership',
    description: 'Analyze ridership patterns and boarded counts per route.',
  },
  {
    href: '/dashboard/reports/performance',
    icon: Clock,
    title: 'Performance',
    description: 'Track on-time performance and delay metrics for routes.',
  },
]

export default function ReportsPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 size={20} style={{ color: 'var(--color-brand-navy)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Reports
        </h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Select a report type to view and export data.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {reportCards.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 hover:border-gray-200 hover:shadow-md transition-all group"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--color-brand-navy)', opacity: 0.9 }}
            >
              <Icon size={20} className="text-white" />
            </div>
            <h2
              className="text-base font-semibold mb-1 group-hover:underline"
              style={{ color: 'var(--color-brand-navy)' }}
            >
              {title}
            </h2>
            <p className="text-sm text-gray-500">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
