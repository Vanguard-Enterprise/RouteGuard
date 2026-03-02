'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Tablet, ScrollText } from 'lucide-react'

const navItems = [
  { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { href: '/admin/devices', label: 'Devices', icon: Tablet },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
]

export default function AdminSidebar() {
  const pathname = usePathname()

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
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
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
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: 'var(--color-brand-amber)', color: 'var(--color-brand-navy)' }}
          >
            A
          </div>
          <span className="text-sm text-blue-200 truncate">Admin</span>
        </div>
      </div>
    </aside>
  )
}
