'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface DriverSession {
  driver_id: string
  driver_name: string
  org_id: string
  trip_id?: string | null
  session_token: string
  started_at?: number
}

export default function RunCompletePage() {
  const router = useRouter()
  const params = useParams()
  const tripId = params.tripId as string
  const [session, setSession] = useState<DriverSession | null>(null)
  const [totalBoarded, setTotalBoarded] = useState(0)
  const [duration, setDuration] = useState<string>('—')

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    try {
      const s = JSON.parse(raw) as DriverSession
      setSession(s)

      // Compute duration if started_at is present
      if (s.started_at) {
        const elapsed = Math.floor((Date.now() - s.started_at) / 1000)
        const hours = Math.floor(elapsed / 3600)
        const minutes = Math.floor((elapsed % 3600) / 60)
        const parts: string[] = []
        if (hours > 0) parts.push(`${hours}h`)
        parts.push(`${minutes}m`)
        setDuration(parts.join(' '))
      }
    } catch {
      router.replace('/driver')
    }

    // Count boarded scans from session storage if available
    const scansRaw = localStorage.getItem(`trip_scans_${tripId}`)
    if (scansRaw) {
      try {
        const arr = JSON.parse(scansRaw) as Array<{ scan_type: string }>
        setTotalBoarded(arr.filter((s) => s.scan_type === 'board').length)
      } catch {
        // ignore
      }
    }
  }, [router, tripId])

  const handleDone = () => {
    localStorage.removeItem('driver_session')
    localStorage.removeItem('trip_manifest')
    localStorage.removeItem(`trip_scans_${tripId}`)
    router.push('/driver')
  }

  if (!session) return null

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-6"
    >
      {/* Success icon */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white"
        style={{ background: '#2A7D4F' }}
      >
        ✓
      </div>

      {/* Header */}
      <div className="text-center">
        <h1 className="text-white text-4xl font-bold">Run Complete!</h1>
        <p className="text-blue-300 mt-2">Great work today, {session.driver_name}</p>
      </div>

      {/* Summary card */}
      <div
        className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: '#152D47' }}
      >
        <SummaryRow label="Driver" value={session.driver_name} />
        <SummaryRow label="Date" value={today} />
        <SummaryRow label="Trip ID" value={tripId.slice(0, 8) + '…'} />
        <SummaryRow label="Total students boarded" value={String(totalBoarded)} />
        <SummaryRow label="Run duration" value={duration} />
      </div>

      <button
        onClick={handleDone}
        className="w-full max-w-sm py-4 rounded-xl text-white text-xl font-bold active:scale-95 transition-transform"
        style={{ background: '#2A7D4F' }}
      >
        Done
      </button>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-blue-300 text-sm">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  )
}
