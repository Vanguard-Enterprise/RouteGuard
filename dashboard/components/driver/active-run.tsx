'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X, LogIn, LogOut, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogoIcon } from '@/components/logo'
import ScanFeedback, { type FeedbackType } from './scan-feedback'
import NavigationMap from '@/components/driver/navigation-map'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const GPS_INTERVAL_MS = 5000

export interface ActiveRunStop {
  id: string
  name: string
  sequence_order: number
  lat: number | null
  lng: number | null
  address: string | null
}

interface ManifestStudent {
  id: string
  first_name: string
  last_name: string
  rfid_tag_id?: string | null
}

interface StopEntry {
  stop: ActiveRunStop
  students: ManifestStudent[]
}

type BoardingStatus = 'pending' | 'boarded' | 'absent'

interface ActiveRunProps {
  tripId: string
}

export default function ActiveRun({ tripId }: ActiveRunProps) {
  const router = useRouter()
  const [currentStopIdx, setCurrentStopIdx] = useState(0)
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null)
  const [feedbackStudentName, setFeedbackStudentName] = useState<string | undefined>()
  const [manifest, setManifest] = useState<StopEntry[]>([])
  const [boardingStatus, setBoardingStatus] = useState<Map<string, BoardingStatus>>(new Map())
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)
  const [endingRun, setEndingRun] = useState(false)

  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const lastPingRef = useRef<number>(0)
  const [scanMode, setScanMode] = useState<'board' | 'exit'>('board')
  const scanBufferRef = useRef('')
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScannedRef = useRef<Map<string, number>>(new Map())
  const DEDUP_MS = 3000

  // All students across all stops (for wrong-stop detection)
  const allStudentStopMap = useRef<Map<string, string[]>>(new Map())

  useEffect(() => {
    // Load the trip session token for API calls
    const sessionRaw = localStorage.getItem('driver_session')
    if (sessionRaw) {
      try {
        const session = JSON.parse(sessionRaw) as { session_token: string }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSessionToken(session.session_token)
      } catch { /* ignore */ }
    }

    const raw = localStorage.getItem('trip_manifest')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as StopEntry[]
      setManifest(parsed)
      // Build map: studentId -> [stopId, ...]
      const map = new Map<string, string[]>()
      for (const entry of parsed) {
        for (const student of entry.students) {
          const existing = map.get(student.id) ?? []
          existing.push(entry.stop.id)
          map.set(student.id, existing)
        }
      }
      allStudentStopMap.current = map
    } catch {
      setManifest([])
    }
  }, [])

  const stops = manifest.map((e) => e.stop)
  const currentStopStudents = manifest[currentStopIdx]?.students ?? []
  const currentStopId = stops[currentStopIdx]?.id

  const postLocation = useCallback(
    (lat: number, lng: number, heading: number | null, speed: number | null) => {
      const now = Date.now()
      if (now - lastPingRef.current < GPS_INTERVAL_MS) return
      if (!sessionToken) return
      lastPingRef.current = now
      fetch(`${API_BASE}/api/v1/trips/${tripId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ lat, lng, heading: heading ?? 0, speed: speed ?? 0 }),
      }).catch(() => {})
    },
    [tripId, sessionToken]
  )

  const handleNextStop = () => {
    setCurrentStopIdx((prev) => Math.min(prev + 1, Math.max(stops.length - 1, 0)))
    setFeedbackType(null)
  }

  const handleEndRun = async () => {
    setEndingRun(true)
    try {
      await fetch(`${API_BASE}/api/v1/trips/${tripId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
    } catch {
      // Best-effort
    }
    router.push(`/driver/run/${tripId}/complete`)
  }

  const handleDismissFeedback = useCallback(() => setFeedbackType(null), [])

  const submitScan = useCallback(async (rfidTagId: string) => {
    const now = Date.now()
    const lastSeen = lastScannedRef.current.get(rfidTagId) ?? 0
    if (now - lastSeen < DEDUP_MS) return
    if (!sessionToken) return
    lastScannedRef.current.set(rfidTagId, now)

    const currentStop = stops[currentStopIdx]
    try {
      const res = await fetch(`${API_BASE}/api/v1/trips/${tripId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          rfid_tag_id: rfidTagId,
          scan_type: scanMode,
          stop_id: currentStop?.id ?? null,
        }),
      })
      if (!res.ok) return
      const data = await res.json() as {
        authorized: boolean
        student?: { first_name: string; last_name: string; id: string }
        scan_event: { id: string }
      }
      const studentName = data.student
        ? `${data.student.first_name} ${data.student.last_name}`
        : undefined

      if (!data.authorized) {
        setFeedbackType('unauthorized')
        setFeedbackStudentName(undefined)
      } else if (data.student) {
        // Check if this student belongs to the current stop
        const studentStops = allStudentStopMap.current.get(data.student.id) ?? []
        const isCorrectStop = currentStopId ? studentStops.includes(currentStopId) : false

        if (isCorrectStop) {
          setFeedbackType(scanMode)
          setFeedbackStudentName(studentName)
        } else {
          setFeedbackType('wrong-stop')
          setFeedbackStudentName(studentName)
        }

        // Mark student as boarded/exited
        setBoardingStatus((prev) => {
          const next = new Map(prev)
          next.set(data.student!.id, scanMode === 'board' ? 'boarded' : 'absent')
          return next
        })
      }
    } catch {
      // Silent fail
    }
  }, [tripId, scanMode, stops, currentStopIdx, currentStopId, sessionToken])

  // Keyboard wedge listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showConfirmEnd) return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === 'Enter') {
        const tag = scanBufferRef.current.trim()
        scanBufferRef.current = ''
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
        if (tag) submitScan(tag)
        return
      }
      if (e.key.length === 1) {
        scanBufferRef.current += e.key
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
        scanTimerRef.current = setTimeout(() => {
          const tag = scanBufferRef.current.trim()
          scanBufferRef.current = ''
          if (tag) submitScan(tag)
        }, 100)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmEnd, submitScan])

  const toggleStudentStatus = (studentId: string, current: BoardingStatus) => {
    setBoardingStatus((prev) => {
      const next = new Map(prev)
      if (current === 'pending' || current === 'absent') {
        next.set(studentId, 'boarded')
      } else {
        next.set(studentId, 'absent')
      }
      return next
    })
  }

  const boardedCount = currentStopStudents.filter(
    (s) => (boardingStatus.get(s.id) ?? 'pending') === 'boarded'
  ).length
  const totalStudents = manifest.reduce((sum, e) => sum + e.students.length, 0)
  const totalBoarded = [...boardingStatus.values()].filter((s) => s === 'boarded').length

  return (
    <div className="fixed inset-0 flex">
      <ScanFeedback
        feedbackType={feedbackType}
        studentName={feedbackStudentName}
        onDismiss={handleDismissFeedback}
      />

      {/* Left: Navigation Map */}
      <div className="flex-1 relative">
        <NavigationMap
          mode="route"
          stops={stops}
          currentStopIdx={currentStopIdx}
          onArrival={handleNextStop}
          onPositionUpdate={postLocation}
        >
          {/* Trip badge */}
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow px-3 py-2">
            <LogoIcon className="h-6 w-6" />
            <Badge variant="outline" className="font-mono text-xs">
              Trip #{tripId.slice(0, 8)}
            </Badge>
          </div>
        </NavigationMap>
      </div>

      {/* Right: Student Boarding Panel */}
      <div className="w-80 bg-background border-l border-border flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm" style={{ color: 'var(--color-brand-navy)' }}>
              Student Boarding
            </h2>
            <Button
              onClick={() => setShowConfirmEnd(true)}
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 px-2"
            >
              <X className="size-4 mr-1" /> End
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalBoarded}/{totalStudents} total boarded
          </p>
        </div>

        {/* Current Stop */}
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Current Stop
              </p>
              <p className="font-semibold text-sm mt-0.5 text-foreground">
                {stops[currentStopIdx]?.name ?? 'No stops'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{boardedCount}/{currentStopStudents.length}</p>
              <p className="text-xs text-muted-foreground">boarded</p>
            </div>
          </div>
        </div>

        {/* Student List */}
        <div className="flex-1 overflow-y-auto">
          {currentStopStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">No students at this stop</p>
            </div>
          ) : (
            currentStopStudents.map((student) => {
              const status = boardingStatus.get(student.id) ?? 'pending'
              return (
                <div
                  key={student.id}
                  className={`flex items-center justify-between px-4 py-3 border-b border-border transition-colors ${
                    status === 'boarded'
                      ? 'bg-green-50'
                      : status === 'absent'
                        ? 'bg-red-50'
                        : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {student.first_name} {student.last_name}
                    </p>
                    {!student.rfid_tag_id && (
                      <p className="text-xs text-muted-foreground">No RFID</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleStudentStatus(student.id, status)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                      status === 'boarded'
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : status === 'absent'
                          ? 'bg-red-100 text-red-600 border border-red-300'
                          : 'bg-muted text-muted-foreground border border-border'
                    }`}
                  >
                    {status === 'boarded' ? (
                      <><UserCheck className="size-3.5" /> Boarded</>
                    ) : status === 'absent' ? (
                      <><UserX className="size-3.5" /> Absent</>
                    ) : (
                      'Pending'
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom Controls */}
        <div className="border-t border-border px-4 py-3 space-y-2">
          {/* Scan mode toggle */}
          <div className="flex gap-2">
            <Button
              onClick={() => setScanMode('board')}
              variant={scanMode === 'board' ? 'default' : 'outline'}
              size="sm"
              className={`flex-1 ${scanMode === 'board' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
            >
              <LogIn className="size-4 mr-1" /> Board
            </Button>
            <Button
              onClick={() => setScanMode('exit')}
              variant={scanMode === 'exit' ? 'default' : 'outline'}
              size="sm"
              className={`flex-1 ${scanMode === 'exit' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
            >
              <LogOut className="size-4 mr-1" /> Exit
            </Button>
          </div>

          {/* Next stop */}
          {stops.length > 0 && currentStopIdx < stops.length - 1 && (
            <Button
              onClick={handleNextStop}
              className="w-full bg-[var(--color-brand-navy)] hover:opacity-90 text-white"
            >
              <ChevronRight className="size-4 mr-1" />
              Next Stop: {stops[currentStopIdx + 1]?.name}
            </Button>
          )}
        </div>
      </div>

      {/* End run confirmation */}
      {showConfirmEnd && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-1">End this run?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This will complete the trip and submit all scan records.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmEnd(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={endingRun}
                onClick={handleEndRun}
              >
                {endingRun ? 'Ending...' : 'End Run'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
