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
        <Logo className="h-10 w-auto max-w-full" />
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
