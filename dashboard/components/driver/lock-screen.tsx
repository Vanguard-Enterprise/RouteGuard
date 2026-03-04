'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinPad from './pin-pad'

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
      const session = {
        driver_id: data.driver_id,
        driver_name: data.driver_name,
        org_id: data.org_id,
        session_token: data.session_token,
      }
      localStorage.setItem('driver_session', JSON.stringify(session))
      router.push('/driver/pre-trip')
    } catch {
      setErrorMessage('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ background: '#1B3A5C' }}
      className="min-h-screen flex flex-col items-center justify-center gap-10 px-4"
    >
      {/* Brand header */}
      <div className="text-center flex flex-col items-center gap-2">
        <h1 style={{ color: '#F5A825' }} className="text-5xl font-bold tracking-tight">
          RouteGuard
        </h1>
        <p className="text-blue-300 text-lg">{getGreeting()}</p>
      </div>

      {/* PIN card */}
      <div
        className="rounded-3xl px-8 py-8 flex flex-col items-center gap-6 w-full max-w-xs"
        style={{ background: '#152D47', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-blue-300 text-xs uppercase tracking-widest">Enter your PIN</p>
        <PinPad onSubmit={handlePinSubmit} loading={loading} error={pinError} />
        {errorMessage && (
          <p className="text-red-400 text-sm text-center">{errorMessage}</p>
        )}
      </div>

      {/* RFID hint */}
      <div className="flex flex-col items-center gap-2 opacity-50">
        <div className="w-12 h-px bg-blue-500" />
        <p className="text-blue-300 text-sm">or tap your RFID badge</p>
      </div>
    </div>
  )
}
