# Driver Kiosk Visual Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded-hex driver kiosk UI with shadcn/ui components in dark mode, matching the admin panel's approach.

**Architecture:** Add `className="dark"` to `driver/layout.tsx` so all children inherit dark CSS variables. Replace every raw div/button/table in the 7 driver components with shadcn `Card`, `Button`, `Badge`, `Separator`, `Skeleton`, and `Dialog`. Swap "RouteGuard" text with `<Logo>` / `<LogoIcon>` from `components/logo.tsx`. Use lucide-react icons throughout.

**Tech Stack:** Next.js App Router, shadcn/ui, Tailwind v4, lucide-react, TypeScript

---

### Task 1: Layout - Enable dark mode

**Files:**
- Modify: `dashboard/app/driver/layout.tsx`

**Step 1: Replace both returned divs to use dark mode and CSS variables**

```tsx
'use client'
import { useEffect, useState } from 'react'
import SWRegister from '@/components/driver/sw-register'

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const [provisioned, setProvisioned] = useState<boolean | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProvisioned(!!localStorage.getItem('device_token'))
  }, [])

  if (provisioned === null) return null

  if (!provisioned) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-lg">
          Contact your administrator to provision this device.
        </p>
      </div>
    )
  }

  return (
    <div className="dark min-h-screen bg-background">
      <SWRegister />
      {children}
    </div>
  )
}
```

**Step 2: Commit**

```bash
cd dashboard
git add app/driver/layout.tsx
git commit -m "feat: enable dark mode on driver layout"
```

---

### Task 2: Lock Screen

**Files:**
- Modify: `dashboard/components/driver/lock-screen.tsx`

**Step 1: Rewrite the component**

The entire file becomes:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinPad from './pin-pad'
import { Logo } from '@/components/logo'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CreditCard } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function LockScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePinSubmit = async (pin: string) => {
    const deviceToken = localStorage.getItem('device_token')
    if (!deviceToken) return

    setLoading(true)
    setErrorMessage(null)
    setPinError(false)

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({ pin }),
      })

      if (res.status === 401) {
        setPinError(true)
        setTimeout(() => setPinError(false), 1500)
        return
      }

      if (!res.ok) {
        setErrorMessage('Authentication failed. Please try again.')
        return
      }

      const data = await res.json()
      localStorage.setItem('driver_session', JSON.stringify({
        driver_id: data.driver_id,
        driver_name: data.driver_name,
        org_id: data.org_id,
        session_token: data.session_token,
      }))
      router.push('/driver/pre-trip')
    } catch {
      setErrorMessage('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 px-4">
      <div className="flex flex-col items-center gap-2">
        <Logo className="h-10 w-auto" />
        <p className="text-muted-foreground text-lg">{getGreeting()}</p>
      </div>

      <Card className="w-full max-w-xs">
        <CardContent className="pt-6 flex flex-col items-center gap-6">
          <p className="text-muted-foreground text-xs uppercase tracking-widest">
            Enter your PIN
          </p>
          <PinPad onSubmit={handlePinSubmit} loading={loading} error={pinError} />
          {errorMessage && (
            <p className="text-destructive text-sm text-center">{errorMessage}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <Separator />
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <CreditCard className="size-4" />
          <span>or tap your RFID badge</span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/driver/lock-screen.tsx
git commit -m "feat: redesign lock screen with shadcn Card and Logo"
```

---

### Task 3: PIN Pad

**Files:**
- Modify: `dashboard/components/driver/pin-pad.tsx`

**Step 1: Replace raw buttons with shadcn Button**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Delete } from 'lucide-react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  loading?: boolean
  error?: boolean
}

const MAX_DIGITS = 6

export default function PinPad({ onSubmit, loading = false, error = false }: PinPadProps) {
  const [digits, setDigits] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShake(true)
      const timer = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setDigits(''), 1500)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleDigit = (d: string) => {
    if (loading) return
    setDigits((prev) => (prev.length < MAX_DIGITS ? prev + d : prev))
  }

  const handleBackspace = () => {
    if (loading) return
    setDigits((prev) => prev.slice(0, -1))
  }

  const handleConfirm = () => {
    if (loading || digits.length < 4) return
    onSubmit(digits)
  }

  const numberRows = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN dot display */}
      <div className={`flex gap-3 ${shake ? 'animate-pin-shake' : ''}`}>
        {Array.from({ length: MAX_DIGITS }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors duration-150 ${
              i < digits.length
                ? error
                  ? 'bg-destructive border-destructive'
                  : 'border-[#F5A825]'
                : 'bg-transparent border-border'
            }`}
            style={i < digits.length && !error ? { background: '#F5A825' } : undefined}
          />
        ))}
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-3 gap-3">
        {numberRows.map((btn) => (
          <Button
            key={btn}
            variant="outline"
            onClick={() => handleDigit(btn)}
            disabled={loading}
            aria-label={btn}
            className="w-[72px] h-[72px] rounded-full text-xl font-semibold"
          >
            {btn}
          </Button>
        ))}
        {/* Bottom row */}
        <Button
          variant="ghost"
          onClick={handleBackspace}
          disabled={loading}
          aria-label="Backspace"
          className="w-[72px] h-[72px] rounded-full"
        >
          <Delete className="size-5" />
        </Button>
        <Button
          variant="outline"
          onClick={() => handleDigit('0')}
          disabled={loading}
          aria-label="0"
          className="w-[72px] h-[72px] rounded-full text-xl font-semibold"
        >
          0
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading || digits.length < 4}
          aria-label="Confirm"
          className="w-[72px] h-[72px] rounded-full text-xl font-semibold bg-green-600 hover:bg-green-500 text-white"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            '✓'
          )}
        </Button>
      </div>

      <style>{`
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-pin-shake {
          animation: pin-shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/driver/pin-pad.tsx
git commit -m "feat: replace raw PIN buttons with shadcn Button"
```

---

### Task 4: Route Summary

**Files:**
- Modify: `dashboard/components/driver/route-summary.tsx`

**Step 1: Rewrite with Card, Badge, Skeleton, lucide icons**

```tsx
'use client'
import { User, MapPin, Bus, Hash, Navigation } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface RoutePreview {
  route_name: string
  route_type: string
  stop_count: number
  vehicle_name: string
  date: string
}

interface RouteSummaryProps {
  driverName: string
  preview: RoutePreview | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}

export default function RouteSummary({ driverName, preview, loading, error, onRetry }: RouteSummaryProps) {
  const dateString = preview
    ? new Date(preview.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      {/* Driver card */}
      <Card>
        <CardContent className="pt-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground text-xl font-semibold">{driverName}</p>
            <p className="text-muted-foreground text-sm">{dateString}</p>
          </div>
        </CardContent>
      </Card>

      {/* Assignment card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
            Today&apos;s Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex flex-col gap-3">
          {loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col gap-3">
              <p className="text-destructive text-sm">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="self-start text-muted-foreground text-xs px-3 py-1.5 rounded-lg border border-border hover:text-foreground transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !error && preview && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" style={{ color: '#F5A825' }} />
                <p className="text-xl font-bold" style={{ color: '#F5A825' }}>
                  {preview.route_name}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <Bus className="size-3 mr-1" />
                  {preview.vehicle_name}
                </Badge>
                <Badge variant="secondary">
                  <Hash className="size-3 mr-1" />
                  {preview.stop_count} stops
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  <Navigation className="size-3 mr-1" />
                  {preview.route_type}
                </Badge>
              </div>
            </div>
          )}

          {!loading && !error && !preview && (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">No route assigned for today.</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="self-start text-muted-foreground text-xs px-3 py-1.5 rounded-lg border border-border hover:text-foreground transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/driver/route-summary.tsx
git commit -m "feat: redesign route summary with Card, Badge, Skeleton"
```

---

### Task 5: Pre-Trip Page

**Files:**
- Modify: `dashboard/app/driver/pre-trip/page.tsx`

**Step 1: Update header and buttons - replace the JSX return block**

The logic (state, effects, handlers) is unchanged. Only the returned JSX changes. Replace the entire `return (...)` block starting at line 123:

```tsx
// Add these imports at the top of the file (after the existing imports):
import { Button } from '@/components/ui/button'
import { LogoIcon } from '@/components/logo'

// Replace the return block:
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <LogoIcon className="h-8 w-8" />
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Log Out
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 pb-8">
        <div className="text-center">
          <h2 className="text-foreground text-3xl font-bold">
            Ready for your run?
          </h2>
          <p className="text-muted-foreground mt-2">Review your assignment below</p>
        </div>

        <RouteSummary
          driverName={session.driver_name}
          preview={preview}
          loading={previewLoading}
          error={previewError}
          onRetry={handleRetry}
        />

        {startError && (
          <p className="text-destructive text-sm text-center">{startError}</p>
        )}

        <Button
          onClick={handleStartRun}
          disabled={starting || previewLoading || (!preview && !previewError)}
          size="lg"
          className="w-full max-w-sm h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white"
        >
          {starting ? (
            <span className="flex items-center gap-3">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Starting...
            </span>
          ) : (
            'Start Run'
          )}
        </Button>
      </div>
    </div>
  )
```

**Step 2: Commit**

```bash
git add app/driver/pre-trip/page.tsx
git commit -m "feat: redesign pre-trip header and buttons"
```

---

### Task 6: Student Scan List

**Files:**
- Modify: `dashboard/components/driver/student-scan-list.tsx`

**Step 1: Replace table with card-based list and lucide icons**

Note: the `stopId` prop is removed since it was only used for a debug label. Update `active-run.tsx` in Task 7 to remove that prop.

```tsx
'use client'
import { UserCheck, UserMinus, AlertCircle, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface ScanEvent {
  id: string
  rfid_tag_id: string
  student_name?: string
  scan_type: 'board' | 'exit' | 'unauthorized'
  timestamp: number
}

interface StudentScanListProps {
  scans: ScanEvent[]
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

const SCAN_CONFIG = {
  board: {
    Icon: UserCheck,
    iconClass: 'text-green-400',
    badgeClass: 'bg-green-900/50 text-green-200 border-green-700',
    label: 'Boarded',
  },
  exit: {
    Icon: UserMinus,
    iconClass: 'text-amber-400',
    badgeClass: 'bg-amber-900/50 text-amber-200 border-amber-700',
    label: 'Exited',
  },
  unauthorized: {
    Icon: AlertCircle,
    iconClass: 'text-destructive',
    badgeClass: 'bg-destructive/20 text-destructive border-destructive/50',
    label: 'Unknown',
  },
}

export default function StudentScanList({ scans }: StudentScanListProps) {
  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Users className="size-8" />
        <p className="text-sm">Awaiting scans for this stop</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {scans.map((scan) => {
        const cfg = SCAN_CONFIG[scan.scan_type]
        return (
          <div
            key={scan.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <cfg.Icon className={`size-5 shrink-0 ${cfg.iconClass}`} />
            <span className="flex-1 text-foreground text-sm font-medium">
              {scan.student_name ?? (
                <span className="text-muted-foreground italic">Unknown</span>
              )}
            </span>
            <Badge className={`text-xs ${cfg.badgeClass}`} variant="outline">
              {cfg.label}
            </Badge>
            <span className="text-muted-foreground text-xs tabular-nums">
              {timeAgo(scan.timestamp)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/driver/student-scan-list.tsx
git commit -m "feat: redesign scan list with card rows and lucide icons"
```

---

### Task 7: Active Run

**Files:**
- Modify: `dashboard/components/driver/active-run.tsx`

This is the largest change. The logic (GPS, manifest loading, handlers) is preserved; only imports and JSX change.

**Step 1: Rewrite the file**

```tsx
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
            <MapPin className="size-7 shrink-0" style={{ color: '#F5A825' }} />
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
```

**Step 2: Commit**

```bash
git add components/driver/active-run.tsx
git commit -m "feat: redesign active run with progress bar, Dialog, shadcn components"
```

---

### Task 8: Scan Feedback

**Files:**
- Modify: `dashboard/components/driver/scan-feedback.tsx`

**Step 1: Replace text icons with lucide icons**

```tsx
'use client'
import { useEffect } from 'react'
import { CheckCircle2, LogOut, ShieldX } from 'lucide-react'

export type FeedbackType = 'board' | 'exit' | 'unauthorized' | null

interface ScanFeedbackProps {
  feedbackType: FeedbackType
  studentName?: string
  onDismiss: () => void
}

const FEEDBACK_CONFIG = {
  board: {
    bgClass: 'bg-green-600',
    Icon: CheckCircle2,
    label: (name?: string) => `${name ?? 'Student'} - Boarded`,
  },
  exit: {
    bgClass: 'bg-amber-600',
    Icon: LogOut,
    label: (name?: string) => `${name ?? 'Student'} - Exited`,
  },
  unauthorized: {
    bgClass: 'bg-destructive',
    Icon: ShieldX,
    label: () => 'Unknown Tag',
  },
}

export default function ScanFeedback({
  feedbackType,
  studentName,
  onDismiss,
}: ScanFeedbackProps) {
  useEffect(() => {
    if (!feedbackType) return
    const timer = setTimeout(onDismiss, 2000)
    return () => clearTimeout(timer)
  }, [feedbackType, onDismiss])

  if (!feedbackType) return null

  const config = FEEDBACK_CONFIG[feedbackType]

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 animate-scan-feedback ${config.bgClass}`}
      onClick={onDismiss}
    >
      <config.Icon className="size-24 text-white" strokeWidth={1.5} />
      <p className="text-white text-3xl font-semibold text-center px-8">
        {config.label(studentName)}
      </p>
      <p className="text-white/60 text-sm">Tap to dismiss</p>

      <style>{`
        @keyframes scan-feedback-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scan-feedback {
          animation: scan-feedback-in 0.15s ease-out;
        }
      `}</style>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/driver/scan-feedback.tsx
git commit -m "feat: replace scan feedback text icons with lucide icons"
```

---

### Task 9: Complete Page

**Files:**
- Modify: `dashboard/app/driver/run/[tripId]/complete/page.tsx`

**Step 1: Rewrite with Card, Separator, CheckCircle2, Button**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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
  const [duration, setDuration] = useState<string>('-')

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    try {
      const s = JSON.parse(raw) as DriverSession
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(s)

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

  const rows = [
    { label: 'Driver', value: session.driver_name },
    { label: 'Date', value: today },
    { label: 'Trip ID', value: tripId.slice(0, 8) + '...' },
    { label: 'Students boarded', value: String(totalBoarded) },
    { label: 'Run duration', value: duration },
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
      <CheckCircle2 className="size-24 text-green-400" strokeWidth={1.5} />

      <div className="text-center">
        <h1 className="text-foreground text-4xl font-bold">Run Complete!</h1>
        <p className="text-muted-foreground mt-2">Great work today, {session.driver_name}</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="pt-5 flex flex-col">
          {rows.map((row, i) => (
            <div key={row.label}>
              <div className="flex items-center justify-between py-3">
                <span className="text-muted-foreground text-sm">{row.label}</span>
                <span className="text-foreground font-medium">{row.value}</span>
              </div>
              {i < rows.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Button
        onClick={handleDone}
        size="lg"
        className="w-full max-w-sm h-14 text-base bg-[#2A7D4F] hover:bg-[#235f3c] text-white"
      >
        Done
      </Button>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add app/driver/run/[tripId]/complete/page.tsx
git commit -m "feat: redesign complete page with Card, CheckCircle2, shadcn Button"
```

---

### Task 10: Verify and Final Commit

**Step 1: Run lint**

```bash
cd dashboard
npm run lint
```

Expected: 0 errors. If there are errors, fix them before proceeding. Common issues:
- Unused imports (remove them)
- Missing `key` props
- `any` type warnings

**Step 2: Run build**

```bash
npm run build
```

Expected: Build completes with no TypeScript errors. If there are type errors, fix them.

**Step 3: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "fix: lint and type errors in driver kiosk redesign"
```
