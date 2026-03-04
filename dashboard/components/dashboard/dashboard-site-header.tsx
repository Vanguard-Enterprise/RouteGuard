'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { DashboardBreadcrumb } from '@/components/dashboard/dashboard-breadcrumb'
import AlertPanel from '@/components/dashboard/alert-panel'
import { useTripStream } from '@/hooks/use-trip-stream'
import type { AlertEvent } from '@/hooks/use-trip-stream'

interface DashboardSiteHeaderProps {
  orgId: string
}

export function DashboardSiteHeader({ orgId }: DashboardSiteHeaderProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [localAlerts, setLocalAlerts] = useState<AlertEvent[]>([])
  const { alerts: streamAlerts } = useTripStream(orgId)
  const lastSeenTimestampRef = useRef<string | null>(null)
  const dismissedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (streamAlerts.length === 0) return
    const newest = streamAlerts[0]
    if (newest.timestamp === lastSeenTimestampRef.current) return
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
    setLocalAlerts(
      streamAlerts.filter((a) => !dismissedRef.current.has(`${a.type}-${a.timestamp}-${a.trip_id}`)),
    )
  }, [streamAlerts])

  function handleDismiss(idx: number) {
    const dismissed = localAlerts[idx]
    if (dismissed) {
      dismissedRef.current.add(`${dismissed.type}-${dismissed.timestamp}-${dismissed.trip_id}`)
    }
    setLocalAlerts((prev) => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    if (!panelOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen])

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      <DashboardBreadcrumb />
      <div className="ml-auto relative">
        <button
          onClick={() => setPanelOpen(!panelOpen)}
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
    </header>
  )
}
