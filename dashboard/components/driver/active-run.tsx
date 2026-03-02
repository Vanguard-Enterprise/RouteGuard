'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ScanFeedback, { type FeedbackType } from './scan-feedback'
import StudentScanList, { type ScanEvent } from './student-scan-list'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const GPS_INTERVAL_MS = 5000

interface Stop {
  id: string
  name: string
  order: number
}

interface ActiveRunProps {
  tripId: string
}

export default function ActiveRun({ tripId }: ActiveRunProps) {
  const router = useRouter()
  const [currentStopIdx, setCurrentStopIdx] = useState(0)
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null)
  const [feedbackStudentName, setFeedbackStudentName] = useState<string | undefined>()
  const [scans, setScans] = useState<ScanEvent[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)
  const [endingRun, setEndingRun] = useState(false)

  const lastPingRef = useRef<number>(0)
  const watchIdRef = useRef<number | null>(null)

  // Load trip manifest from localStorage (external system → state init)
  useEffect(() => {
    const raw = localStorage.getItem('trip_manifest')
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStops(JSON.parse(raw) as Stop[])
      } catch {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStops([])
      }
    }
  }, [])

  // GPS tracking
  const postLocation = useCallback(
    (lat: number, lng: number, heading: number | null, speed: number | null) => {
      const now = Date.now()
      if (now - lastPingRef.current < GPS_INTERVAL_MS) return
      lastPingRef.current = now

      const deviceToken = localStorage.getItem('device_token')
      fetch(`${API_BASE}/api/v1/trips/${tripId}/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ lat, lng, heading: heading ?? 0, speed: speed ?? 0 }),
      }).catch(() => {})
    },
    [tripId]
  )

  useEffect(() => {
    if (!navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        postLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.heading,
          pos.coords.speed
        )
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [postLocation])

  const handleNextStop = () => {
    setCurrentStopIdx((prev) => Math.min(prev + 1, Math.max(stops.length - 1, 0)))
    setFeedbackType(null)
  }

  const handleEndRun = async () => {
    setEndingRun(true)
    const deviceToken = localStorage.getItem('device_token')
    try {
      await fetch(`${API_BASE}/api/v1/trips/${tripId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deviceToken}` },
      })
    } catch {
      // Best-effort — still navigate
    }
    router.push(`/driver/run/${tripId}/complete`)
  }

  const handleDismissFeedback = useCallback(() => setFeedbackType(null), [])

  // Dev-mode simulated scan
  const simulateScan = () => {
    const types: FeedbackType[] = ['board', 'exit', 'unauthorized']
    const type = types[Math.floor(Math.random() * types.length)]
    const name = type !== 'unauthorized' ? 'Alex Johnson' : undefined
    setFeedbackType(type)
    setFeedbackStudentName(name)
    const event: ScanEvent = {
      id: crypto.randomUUID(),
      rfid_tag_id: 'TAG' + Math.random().toString(16).slice(2, 10).toUpperCase(),
      student_name: name,
      scan_type: type ?? 'unauthorized',
      timestamp: Date.now(),
    }
    setScans((prev) => [event, ...prev])
  }

  const currentStop = stops[currentStopIdx]

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col"
    >
      {/* Scan feedback overlay */}
      <ScanFeedback
        feedbackType={feedbackType}
        studentName={feedbackStudentName}
        onDismiss={handleDismissFeedback}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-blue-800"
      >
        <h1 style={{ color: '#F5A825' }} className="text-xl font-bold">
          RouteGuard
        </h1>
        <span className="text-blue-300 text-sm">Trip #{tripId.slice(0, 8)}</span>
      </div>

      {/* Current stop */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        {stops.length > 0 ? (
          <>
            <p className="text-blue-300 text-sm uppercase tracking-widest">
              Stop {currentStopIdx + 1} of {stops.length}
            </p>
            <h2 className="text-white text-4xl font-bold text-center">
              {currentStop?.name ?? 'Unknown Stop'}
            </h2>
          </>
        ) : (
          <p className="text-blue-300 text-lg text-center">
            Trip in progress — no manifest loaded
          </p>
        )}

        {/* Scan list */}
        <div className="w-full max-w-lg mt-4">
          <StudentScanList
            stopId={currentStop?.id ?? tripId}
            scans={scans.filter((_, i) => i < 5)}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 px-6 pb-8">
        {stops.length > 0 && currentStopIdx < stops.length - 1 && (
          <button
            onClick={handleNextStop}
            className="w-full py-4 rounded-xl text-white text-lg font-semibold active:scale-95 transition-transform"
            style={{ background: '#2A7D4F' }}
          >
            Next Stop
          </button>
        )}

        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={simulateScan}
            className="w-full py-3 rounded-xl text-blue-200 text-sm font-medium border border-blue-600 active:scale-95 transition-transform"
          >
            Simulate Scan (dev)
          </button>
        )}

        <button
          onClick={() => setShowConfirmEnd(true)}
          className="w-full py-4 rounded-xl text-white text-lg font-semibold border border-red-600 active:scale-95 transition-transform"
          style={{ background: 'transparent' }}
        >
          End Run
        </button>
      </div>

      {/* End run confirmation dialog */}
      {showConfirmEnd && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-6">
          <div
            className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: '#152D47' }}
          >
            <h3 className="text-white text-xl font-bold">End this run?</h3>
            <p className="text-blue-300">
              This will complete the trip and submit all scan records.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-3 rounded-lg text-white border border-blue-600"
              >
                Cancel
              </button>
              <button
                onClick={handleEndRun}
                disabled={endingRun}
                className="flex-1 py-3 rounded-lg text-white font-semibold disabled:opacity-60"
                style={{ background: '#C0392B' }}
              >
                {endingRun ? 'Ending…' : 'End Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
