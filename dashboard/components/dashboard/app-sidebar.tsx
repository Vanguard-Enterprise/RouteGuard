'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Route,
  Bus,
  GraduationCap,
  UserCheck,
  Truck,
  Tablet,
  School,
  BarChart3,
  Settings,
} from 'lucide-react'
import type { User } from '@/lib/api'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  permission: string | null
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, permission: null },
  { href: '/dashboard/routes', label: 'Routes', icon: Route, permission: 'routes:read' },
  { href: '/dashboard/trips', label: 'Trips', icon: Bus, permission: 'trips:read' },
  { href: '/dashboard/students', label: 'Students', icon: GraduationCap, permission: 'students:read' },
  { href: '/dashboard/drivers', label: 'Drivers', icon: UserCheck, permission: 'drivers:read' },
  { href: '/dashboard/vehicles', label: 'Vehicles', icon: Truck, permission: 'vehicles:read' },
  { href: '/dashboard/devices', label: 'Devices', icon: Tablet, permission: 'devices:read' },
  { href: '/dashboard/schools', label: 'Schools', icon: School, permission: 'schools:read' },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3, permission: 'reports:read' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, permission: 'settings:read' },
]

interface AppSidebarProps {
  user: User
}

export default function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()

  const visibleItems = navItems.filter(
    (item) => item.permission === null || user.permissions.includes(item.permission),
  )

  const initials = user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? 'U'

  return (
    <aside
      className="fixed inset-y-0 left-0 w-60 flex flex-col z-30"
      style={{ backgroundColor: 'var(--color-brand-navy)' }}
    >
      <div className="h-16 flex items-center px-5 border-b border-blue-900/60">
        <span className="text-xl font-bold" style={{ color: 'var(--color-brand-amber)' }}>
          RouteGuard
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors relative ${
                isActive
                  ? 'text-amber-400 bg-blue-900/40'
                  : 'text-blue-200 hover:text-white hover:bg-blue-900/30'
              }`}
              style={isActive ? { color: 'var(--color-brand-amber)' } : {}}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r"
                  style={{ backgroundColor: 'var(--color-brand-amber)' }}
                />
              )}
              <Icon size={16} className="shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-blue-900/60">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ backgroundColor: 'var(--color-brand-amber)', color: 'var(--color-brand-navy)' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white truncate font-medium">{user.name}</p>
            <p className="text-xs text-blue-300 truncate">{user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
