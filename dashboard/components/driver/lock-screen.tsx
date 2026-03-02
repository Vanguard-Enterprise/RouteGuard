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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, device_token: deviceToken }),
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
        trip_id: data.trip_id ?? null,
        session_token: data.session_token ?? '',
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
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
    >
      {/* Logo / brand */}
      <div className="text-center">
        <h1 style={{ color: '#F5A825' }} className="text-4xl font-bold tracking-tight">
          RouteGuard
        </h1>
        <p className="text-blue-200 text-lg mt-2">{getGreeting()}</p>
      </div>

      {/* PIN pad section */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-blue-100 text-sm uppercase tracking-widest">Enter your PIN</p>
        <PinPad onSubmit={handlePinSubmit} loading={loading} error={pinError} />
        {errorMessage && (
          <p className="text-red-400 text-sm text-center mt-2">{errorMessage}</p>
        )}
      </div>

      {/* RFID option */}
      <div className="flex flex-col items-center gap-2 opacity-60">
        <div className="w-16 h-px bg-blue-400" />
        <p className="text-blue-300 text-sm">or tap your RFID badge</p>
      </div>
    </div>
  )
}
