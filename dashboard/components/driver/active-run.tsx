'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X, LogIn, LogOut, ChevronUp, ChevronDown, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogoIcon } from '@/components/logo'
import ScanFeedback, { type FeedbackType } from './scan-feedback'
import StudentScanList, { type ScanEvent } from './student-scan-list'
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
  const [scans, setScans] = useState<ScanEvent[]>([])
  const [manifest, setManifest] = useState<StopEntry[]>([])
  const [boardingStatus, setBoardingStatus] = useState<Map<string, BoardingStatus>>(new Map())
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)
  const [endingRun, setEndingRun] = useState(false)
  const [showStudentPanel, setShowStudentPanel] = useState(false)

  const lastPingRef = useRef<number>(0)
  const [scanMode, setScanMode] = useState<'board' | 'exit'>('board')
  const scanBufferRef = useRef('')
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScannedRef = useRef<Map<string, number>>(new Map())
  const DEDUP_MS = 3000

  useEffect(() => {
    const raw = localStorage.getItem('trip_manifest')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as StopEntry[]
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManifest(parsed)
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManifest([])
    }
  }, [])

  const stops = manifest.map((e) => e.stop)
  const currentStopStudents = manifest[currentStopIdx]?.students ?? []

  const postLocation = useCallback(
    (lat: number, lng: number, heading: number | null, speed: number | null) => {
      const now = Date.now()
      if (now - lastPingRef.current < GPS_INTERVAL_MS) return
      lastPingRef.current = now
      const deviceToken = localStorage.getItem('device_token')
      fetch(`${API_BASE}/api/v1/trips/${tripId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
        body: JSON.stringify({ lat, lng, heading: heading ?? 0, speed: speed ?? 0 }),
      }).catch(() => {})
    },
    [tripId]
  )

  const handleNextStop = () => {
    setCurrentStopIdx((prev) => Math.min(prev + 1, Math.max(stops.length - 1, 0)))
    setFeedbackType(null)
    setShowStudentPanel(false)
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
      // Best-effort
    }
    router.push(`/driver/run/${tripId}/complete`)
  }

  const handleDismissFeedback = useCallback(() => setFeedbackType(null), [])

  const submitScan = useCallback(async (rfidTagId: string) => {
    const now = Date.now()
    const lastSeen = lastScannedRef.current.get(rfidTagId) ?? 0
    if (now - lastSeen < DEDUP_MS) return
    lastScannedRef.current.set(rfidTagId, now)

    const deviceToken = localStorage.getItem('device_token')
    const currentStop = stops[currentStopIdx]
    try {
      const res = await fetch(`${API_BASE}/api/v1/trips/${tripId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
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
      const resolvedType = data.authorized ? scanMode : 'unauthorized'
      setFeedbackType(resolvedType)
      setFeedbackStudentName(studentName)

      // Auto-mark student as boarded/exited from the boarding checklist
      if (data.authorized && data.student) {
        setBoardingStatus((prev) => {
          const next = new Map(prev)
          next.set(data.student!.id, scanMode === 'board' ? 'boarded' : 'absent')
          return next
        })
      }

      setScans((prev) => [
        {
          id: data.scan_event.id,
          rfid_tag_id: rfidTagId,
          student_name: studentName,
          scan_type: resolvedType,
          timestamp: Date.now(),
        },
        ...prev,
      ])
    } catch {
      // Silent fail
    }
  }, [tripId, scanMode, stops, currentStopIdx])

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
  const absentCount = currentStopStudents.filter(
    (s) => (boardingStatus.get(s.id) ?? 'pending') === 'absent'
  ).length

  return (
    <div className="fixed inset-0">
      <ScanFeedback
        feedbackType={feedbackType}
        studentName={feedbackStudentName}
        onDismiss={handleDismissFeedback}
      />

      <NavigationMap
        mode="route"
        stops={stops}
        currentStopIdx={currentStopIdx}
        onArrival={handleNextStop}
        onPositionUpdate={postLocation}
      >
        {/* Top header */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow px-3 py-2">
          <LogoIcon className="h-6 w-6" />
          <Badge variant="outline" className="font-mono text-xs">
            Trip #{tripId.slice(0, 8)}
          </Badge>
        </div>

        {/* End run button - top right */}
        <div className="absolute top-3 right-3 z-[1000]">
          <Button
            onClick={() => setShowConfirmEnd(true)}
            variant="secondary"
            size="icon"
            className="h-11 w-11 rounded-full shadow-lg bg-background/95 backdrop-blur-sm"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Bottom panel */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000]">
          {/* Student boarding panel (expanded) */}
          {showStudentPanel && currentStopStudents.length > 0 && (
            <div className="bg-background border-t border-border shadow-2xl max-h-72 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <p className="font-semibold text-sm">{stops[currentStopIdx]?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {boardedCount} boarded · {absentCount} absent · {currentStopStudents.length - boardedCount - absentCount} pending
                  </p>
                </div>
                <button onClick={() => setShowStudentPanel(false)} className="p-1 text-muted-foreground">
                  <ChevronDown className="size-5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                {currentStopStudents.map((student) => {
                  const status = boardingStatus.get(student.id) ?? 'pending'
                  return (
                    <div key={student.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium">
                          {student.first_name} {student.last_name}
                        </p>
                        {!student.rfid_tag_id && (
                          <p className="text-xs text-muted-foreground">No RFID - mark manually</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleStudentStatus(student.id, status)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
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
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bottom controls bar */}
          <div className="bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex items-center gap-3">
            {/* Stop info + student toggle */}
            <button
              className="flex-1 text-left min-w-0"
              onClick={() => currentStopStudents.length > 0 && setShowStudentPanel((v) => !v)}
            >
              <p className="text-sm font-semibold text-foreground truncate">
                {stops[currentStopIdx]?.name ?? 'No stops'}
              </p>
              {currentStopStudents.length > 0 ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {boardedCount}/{currentStopStudents.length} boarded
                  {showStudentPanel ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No students at this stop</p>
              )}
            </button>

            {/* Scan mode toggle */}
            <Button
              onClick={() => setScanMode((m) => m === 'board' ? 'exit' : 'board')}
              variant="secondary"
              size="icon"
              className="h-12 w-12 rounded-2xl shadow shrink-0"
              title={scanMode === 'board' ? 'Board mode' : 'Exit mode'}
            >
              {scanMode === 'board'
                ? <LogIn className="size-5 text-green-600" />
                : <LogOut className="size-5 text-amber-600" />}
            </Button>

            {/* Next stop */}
            {stops.length > 0 && currentStopIdx < stops.length - 1 && (
              <Button
                onClick={handleNextStop}
                size="lg"
                className="h-12 px-5 text-sm bg-[#2A7D4F] hover:bg-[#235f3c] text-white shadow shrink-0"
              >
                <ChevronRight className="size-4" />
                Next Stop
              </Button>
            )}
          </div>
        </div>

        {/* Recent scans list */}
        {scans.length > 0 && (
          <div className="absolute bottom-24 right-3 z-[1000] w-56 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
            <StudentScanList scans={scans.filter((_, i) => i < 5)} />
          </div>
        )}
      </NavigationMap>

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
