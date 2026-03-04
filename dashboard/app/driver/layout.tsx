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
