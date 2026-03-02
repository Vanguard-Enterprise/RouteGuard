'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RouteSummary from '@/components/driver/route-summary'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface DriverSession {
  driver_id: string
  driver_name: string
  org_id: string
  trip_id?: string | null
  session_token: string
}

export default function PreTripPage() {
  const router = useRouter()
  const [session, setSession] = useState<DriverSession | null>(null)
  const [routeAssignmentId, setRouteAssignmentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    try {
      setSession(JSON.parse(raw) as DriverSession)
    } catch {
      router.replace('/driver')
    }
  }, [router])

  const handleStartRun = async () => {
    if (!routeAssignmentId.trim()) {
      setError('Please enter a route assignment ID.')
      return
    }
    if (!session) return

    const deviceToken = localStorage.getItem('device_token')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/api/v1/trips/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ route_assignment_id: routeAssignmentId.trim() }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as { error?: string }).error ?? 'Failed to start trip. Please try again.')
        return
      }

      const data = (await res.json()) as { trip_id: string }
      const updatedSession: DriverSession = { ...session, trip_id: data.trip_id }
      localStorage.setItem('driver_session', JSON.stringify(updatedSession))
      router.push(`/driver/run/${data.trip_id}`)
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  if (!session) return null

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col items-center justify-center gap-10 px-6"
    >
      <div className="text-center">
        <h1 style={{ color: '#F5A825' }} className="text-3xl font-bold">
          Ready to start your run
        </h1>
        <p className="text-blue-300 mt-2">Complete the pre-trip check below</p>
      </div>

      <RouteSummary
        driverName={session.driver_name}
        routeAssignmentId={routeAssignmentId}
        onRouteAssignmentChange={setRouteAssignmentId}
      />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={handleStartRun}
        disabled={loading || !routeAssignmentId.trim()}
        className="
          w-full max-w-sm py-4 rounded-xl text-xl font-bold text-white
          transition-all duration-150 active:scale-95
          disabled:opacity-40 disabled:cursor-not-allowed
        "
        style={{ background: loading ? '#1e6b40' : '#2A7D4F' }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-3">
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Starting...
          </span>
        ) : (
          'Start Run'
        )}
      </button>
    </div>
  )
}
