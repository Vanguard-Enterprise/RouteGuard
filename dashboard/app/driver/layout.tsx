'use client'
import { useEffect, useState } from 'react'
import SWRegister from '@/components/driver/sw-register'

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const [provisioned, setProvisioned] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
    // Support one-time token injection via ?device_token= (used by kiosk bootstrap)
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('device_token')
    if (urlToken) {
      localStorage.setItem('device_token', urlToken)
      window.history.replaceState({}, '', '/driver')
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProvisioned(!!localStorage.getItem('device_token'))
  }, [])

  if (provisioned === null) return null // hydration guard

  if (!provisioned) {
    return (
      <div className="min-h-screen bg-[#F1F4F8] flex items-center justify-center">
        <p className="text-slate-500 text-lg">
          Contact your administrator to provision this device.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F1F4F8]">
      <SWRegister />
      {children}
    </div>
  )
}
