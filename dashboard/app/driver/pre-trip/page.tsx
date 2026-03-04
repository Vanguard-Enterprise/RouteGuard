'use client'
import { useCallback, useEffect, useState } from 'react'
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

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface ManifestStudent {
  id: string
  name: string
}

interface TripManifest {
  trip: { id: string }
  stops: Array<{ stop: { id: string; name: string; sequence_order: number }; students: ManifestStudent[] }>
}

export default function PreTripPage() {
  const router = useRouter()
  const [session, setSession] = useState<DriverSession | null>(null)
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const fetchAssignment = useCallback((token: string) => {
    setPreviewLoading(true)
    setPreviewError(null)
    setPreview(null)
    fetch(`${API_BASE}/api/v1/trips/assignment`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 404) {
          setPreview(null)
          return
        }
        if (!res.ok) throw new Error('Failed to load assignment')
        const data = await res.json() as RoutePreview
        setPreview(data)
      })
      .catch(() => setPreviewError('Could not load your assignment. Check your connection.'))
      .finally(() => setPreviewLoading(false))
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    let parsed: DriverSession
    try {
      parsed = JSON.parse(raw) as DriverSession
    } catch {
      router.replace('/driver')
      return
    }
    setSession(parsed)
    fetchAssignment(parsed.session_token)
  }, [router, fetchAssignment])

  const handleLogout = () => {
    localStorage.removeItem('driver_session')
    router.replace('/driver')
  }

  const handleRetry = () => {
    if (session) fetchAssignment(session.session_token)
  }

  const handleStartRun = async () => {
    if (!session) return
    setStarting(true)
    setStartError(null)

    try {
      const res = await fetch(`${API_BASE}/api/v1/trips/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session_token}`,
        },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setStartError((body as { error?: string }).error ?? 'Failed to start trip. Please try again.')
        return
      }

      const data = (await res.json()) as TripManifest
      localStorage.setItem('trip_manifest', JSON.stringify(data.stops))
      const updatedSession: DriverSession = { ...session, trip_id: data.trip.id }
      localStorage.setItem('driver_session', JSON.stringify(updatedSession))
      router.push(`/driver/run/${data.trip.id}`)
    } catch {
      setStartError('Network error. Please check your connection.')
    } finally {
      setStarting(false)
    }
  }

  if (!session) return null

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col"
    >
      {/* Header with logout */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 style={{ color: '#F5A825' }} className="text-2xl font-bold tracking-tight">
          RouteGuard
        </h1>
        <button
          onClick={handleLogout}
          className="text-blue-300 text-sm px-4 py-2 rounded-lg border border-blue-700 hover:border-blue-500 transition-colors"
        >
          Log Out
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 pb-8">
        <div className="text-center">
          <h2 style={{ color: '#F5A825' }} className="text-3xl font-bold">
            Ready for your run?
          </h2>
          <p className="text-blue-300 mt-2">Review your assignment below</p>
        </div>

        <RouteSummary
          driverName={session.driver_name}
          preview={preview}
          loading={previewLoading}
          error={previewError}
          onRetry={handleRetry}
        />

        {startError && (
          <p className="text-red-400 text-sm text-center">{startError}</p>
        )}

        <button
          onClick={handleStartRun}
          disabled={starting || previewLoading || (!preview && !previewError)}
          className="
            w-full max-w-sm py-4 rounded-xl text-xl font-bold text-white
            transition-all duration-150 active:scale-95
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          style={{ background: starting ? '#1e6b40' : '#2A7D4F' }}
        >
          {starting ? (
            <span className="flex items-center justify-center gap-3">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Starting...
            </span>
          ) : (
            'Start Run'
          )}
        </button>
      </div>
    </div>
  )
}
