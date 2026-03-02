'use client'

import { useState } from 'react'
import { LogOut, ChevronDown } from 'lucide-react'
import { api } from '@/lib/api'
import type { User } from '@/lib/api'

interface AdminHeaderProps {
  user: User | null
  title?: string
}

export default function AdminHeader({ user, title = 'Admin' }: AdminHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    try {
      await api.auth.logout()
    } finally {
      window.location.href = '/staff/login'
    }
  }

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
        {title}
      </h1>

      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: 'var(--color-brand-slate)', color: 'var(--color-brand-navy)' }}
          >
            {user?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <span className="hidden sm:block max-w-[160px] truncate">{user?.name ?? user?.email ?? 'Admin'}</span>
          <ChevronDown size={14} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-2 w-44 bg-white rounded-md shadow-lg border border-gray-100 z-20 py-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
