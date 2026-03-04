'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, ChevronRight } from 'lucide-react'
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

  useEffect(() => {
    const raw = localStorage.getItem('trip_manifest')
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStops(JSON.parse(raw) as Stop[])
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
      // Best-effort
    }
    router.push(`/driver/run/${tripId}/complete`)
  }

  const handleDismissFeedback = useCallback(() => setFeedbackType(null), [])

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
  const progressPct = stops.length > 0 ? ((currentStopIdx + 1) / stops.length) * 100 : 0

  return (
    <div className="min-h-screen flex flex-col">
      <ScanFeedback
        feedbackType={feedbackType}
        studentName={feedbackStudentName}
        onDismiss={handleDismissFeedback}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <LogoIcon className="h-8 w-8" />
        <Badge variant="outline" className="font-mono text-xs">
          Trip #{tripId.slice(0, 8)}
        </Badge>
      </div>

      {/* Progress strip */}
      {stops.length > 0 && (
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground text-xs uppercase tracking-widest">
              Progress
            </span>
            <Badge variant="secondary" className="text-xs">
              Stop {currentStopIdx + 1} of {stops.length}
            </Badge>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, background: '#2A7D4F' }}
            />
          </div>
        </div>
      )}

      {/* Current stop */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-6">
        {stops.length > 0 ? (
          <div className="flex items-center gap-3 text-center">
            <MapPin className="size-7 shrink-0" style={{ color: 'var(--color-brand-amber)' }} />
            <h2 className="text-foreground text-4xl font-bold">
              {currentStop?.name ?? 'Unknown Stop'}
            </h2>
          </div>
        ) : (
          <p className="text-muted-foreground text-lg text-center">
            Trip in progress - no manifest loaded
          </p>
        )}

        <div className="w-full max-w-lg">
          <StudentScanList scans={scans.filter((_, i) => i < 5)} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 px-6 pb-8">
        {stops.length > 0 && currentStopIdx < stops.length - 1 && (
          <Button
            onClick={handleNextStop}
            size="lg"
            className="w-full h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white"
          >
            <ChevronRight className="size-5" />
            Next Stop
          </Button>
        )}

        {process.env.NODE_ENV === 'development' && (
          <Button
            onClick={simulateScan}
            variant="outline"
            size="sm"
            className="w-full text-muted-foreground text-xs"
          >
            Simulate Scan (dev)
          </Button>
        )}

        <Button
          onClick={() => setShowConfirmEnd(true)}
          variant="outline"
          size="lg"
          className="w-full h-14 text-base border-destructive text-destructive hover:bg-destructive/10"
        >
          End Run
        </Button>
      </div>

      {/* End run confirmation dialog */}
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
