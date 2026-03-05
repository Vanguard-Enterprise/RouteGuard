'use client'
import { useEffect, useState } from 'react'
import SWRegister from '@/components/driver/sw-register'

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const [provisioned, setProvisioned] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
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
