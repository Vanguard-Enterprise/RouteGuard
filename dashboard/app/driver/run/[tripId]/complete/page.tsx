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
      <CheckCircle2 className="size-24 text-green-600" strokeWidth={1.5} />

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
