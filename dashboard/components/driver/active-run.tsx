'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X, LogIn, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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

interface ActiveRunProps {
  tripId: string
}

export default function ActiveRun({ tripId }: ActiveRunProps) {
  const router = useRouter()
  const [currentStopIdx, setCurrentStopIdx] = useState(0)
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null)
  const [feedbackStudentName, setFeedbackStudentName] = useState<string | undefined>()
  const [scans, setScans] = useState<ScanEvent[]>([])
  const [stops, setStops] = useState<ActiveRunStop[]>([])
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)
  const [endingRun, setEndingRun] = useState(false)

  const lastPingRef = useRef<number>(0)
  const [scanMode, setScanMode] = useState<'board' | 'exit'>('board')
  const scanBufferRef = useRef('')
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Deduplication: UHF readers re-read continuously while a tag is in range
  const lastScannedRef = useRef<Map<string, number>>(new Map())
  const DEDUP_MS = 3000

  useEffect(() => {
    const raw = localStorage.getItem('trip_manifest')
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Array<{ stop: ActiveRunStop; students: unknown[] }>
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStops(parsed.map((item) => item.stop))
      } catch {
        setStops([])
      }
    }
  }, [])

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
      // Silent fail - scan will be retried on next swipe
    }
  }, [tripId, scanMode, stops, currentStopIdx])

  // Keyboard wedge listener - captures HID RFID scanner output globally
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
        {/* Floating header */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-2xl shadow px-3 py-2">
          <LogoIcon className="h-6 w-6" />
          <Badge variant="outline" className="font-mono text-xs">
            Trip #{tripId.slice(0, 8)}
          </Badge>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-6 left-0 right-0 z-10 flex items-end justify-center gap-3 px-4">
          {stops.length > 0 && currentStopIdx < stops.length - 1 && (
            <Button
              onClick={handleNextStop}
              size="lg"
              className="flex-1 max-w-xs h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white shadow-lg"
            >
              <ChevronRight className="size-5" />
              Arrived
            </Button>
          )}
          <Button
            onClick={() => setScanMode((m) => m === 'board' ? 'exit' : 'board')}
            variant="secondary"
            size="icon"
            className="h-14 w-14 rounded-2xl shadow-lg shrink-0"
            title={scanMode === 'board' ? 'Scan mode: Board (tap to switch to Exit)' : 'Scan mode: Exit (tap to switch to Board)'}
          >
            {scanMode === 'board' ? <LogIn className="size-5 text-green-600" /> : <LogOut className="size-5 text-amber-600" />}
          </Button>
          <Button
            onClick={() => setShowConfirmEnd(true)}
            variant="secondary"
            size="icon"
            className="h-14 w-14 rounded-2xl shadow-lg shrink-0"
            title="End Run"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Dev buttons */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute bottom-24 left-3 z-10 flex flex-col gap-2">
            <Button onClick={simulateScan} variant="outline" size="sm" className="text-xs bg-background/90">
              Simulate Scan
            </Button>
            <Button onClick={handleNextStop} variant="outline" size="sm" className="text-xs bg-background/90">
              Simulate Arrival
            </Button>
          </div>
        )}

        {/* Scan list overlay */}
        {scans.length > 0 && (
          <div className="absolute bottom-24 right-3 z-10 w-56 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden">
            <StudentScanList scans={scans.filter((_, i) => i < 5)} />
          </div>
        )}
      </NavigationMap>

      {/* End run dialog */}
      <Dialog open={showConfirmEnd} onOpenChange={setShowConfirmEnd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this run?</DialogTitle>
            <DialogDescription>
              This will complete the trip and submit all scan records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setShowConfirmEnd(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={endingRun}
              onClick={handleEndRun}
            >
              {endingRun ? 'Ending...' : 'End Run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
