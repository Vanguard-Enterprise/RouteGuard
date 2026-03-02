'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ActiveRun from '@/components/driver/active-run'

interface DriverSession {
  driver_id: string
  driver_name: string
  org_id: string
  trip_id?: string | null
  session_token: string
}

export default function RunPage() {
  const router = useRouter()
  const params = useParams()
  const tripId = params.tripId as string
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('driver_session')
    if (!raw) {
      router.replace('/driver')
      return
    }
    try {
      const session = JSON.parse(raw) as DriverSession
      if (!session.driver_id) {
        router.replace('/driver')
        return
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true)
    } catch {
      router.replace('/driver')
    }
  }, [router])

  if (!ready) return null

  return <ActiveRun tripId={tripId} />
}
