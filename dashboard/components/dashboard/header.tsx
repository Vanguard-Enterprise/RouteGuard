'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut, ChevronDown, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/api'
import { useTripStream } from '@/hooks/use-trip-stream'
import type { AlertEvent } from '@/hooks/use-trip-stream'
import AlertPanel from '@/components/dashboard/alert-panel'

interface DashboardHeaderProps {
  user: User
  title?: string
  orgId: string
}

export default function DashboardHeader({ user, title = 'Dashboard', orgId }: DashboardHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [localAlerts, setLocalAlerts] = useState<AlertEvent[]>([])

  const { alerts: streamAlerts } = useTripStream(orgId)

  // Track the timestamp of the last alert we already toasted to avoid re-firing on re-render
  const lastSeenTimestampRef = useRef<string | null>(null)

  useEffect(() => {
    if (streamAlerts.length === 0) return

    const newest = streamAlerts[0]

    if (newest.timestamp === lastSeenTimestampRef.current) return

    // Find all alerts newer than what we've already seen
    const lastIdx = lastSeenTimestampRef.current
      ? streamAlerts.findIndex((a) => a.timestamp === lastSeenTimestampRef.current)
      : streamAlerts.length

    const newOnes = lastIdx === -1 ? [newest] : streamAlerts.slice(0, lastIdx)

    newOnes.forEach((alert) => {
      if (alert.type === 'route_deviation') {
        toast.warning(alert.message)
      } else {
        toast.error(alert.message)
      }
    })

    lastSeenTimestampRef.current = newest.timestamp
    setLocalAlerts(streamAlerts)
  }, [streamAlerts])

  function handleDismiss(idx: number) {
    setLocalAlerts((prev) => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    if (!menuOpen && !panelOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setPanelOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen, panelOpen])

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

      <div className="flex items-center gap-3">
        {/* Alert bell */}
        <div className="relative">
          <button
            onClick={() => {
              setPanelOpen(!panelOpen)
              setMenuOpen(false)
            }}
            className="relative p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Alerts"
            aria-expanded={panelOpen}
            aria-haspopup="dialog"
          >
            <Bell size={18} />
            {localAlerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold flex items-center justify-center leading-none">
                {localAlerts.length > 99 ? '99+' : localAlerts.length}
              </span>
            )}
          </button>

          {panelOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPanelOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-lg border border-gray-100 z-20 overflow-hidden">
                <AlertPanel alerts={localAlerts} onDismiss={handleDismiss} />
              </div>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => {
              setMenuOpen(!menuOpen)
              setPanelOpen(false)
            }}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: 'var(--color-brand-slate)', color: 'var(--color-brand-navy)' }}
            >
              {user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="hidden sm:block max-w-[160px] truncate">{user.name ?? user.email}</span>
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
      </div>
    </header>
  )
}
