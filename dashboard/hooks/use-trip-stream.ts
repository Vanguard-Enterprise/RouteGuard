'use client'
// dashboard/hooks/use-trip-stream.ts

import { useState, useEffect } from 'react'

export interface LocationEvent {
  trip_id: string
  lat: number
  lng: number
  heading: number | null
  speed: number | null
  timestamp: string
}

export interface ScanEvent {
  trip_id: string
  student_id: string
  student_name: string
  scan_type: 'board' | 'exit'
  stop_id: string
  timestamp: string
}

export interface AlertEvent {
  type: 'unauthorized_scan' | 'bus_offline' | 'route_deviation'
  trip_id: string
  message: string
  timestamp: string
}

export function useTripStream(orgId: string) {
  const [locations, setLocations] = useState<Record<string, LocationEvent>>({})
  const [scans, setScans] = useState<ScanEvent[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])

  useEffect(() => {
    if (!orgId) return
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/dashboard/stream/trips`,
      { withCredentials: true }
    )
    es.addEventListener('location', (e) => {
      const data = JSON.parse(e.data) as LocationEvent
      setLocations(prev => ({ ...prev, [data.trip_id]: data }))
    })
    es.addEventListener('scan', (e) => {
      setScans(prev => [JSON.parse(e.data) as ScanEvent, ...prev].slice(0, 100))
    })
    es.addEventListener('alert', (e) => {
      setAlerts(prev => [JSON.parse(e.data) as AlertEvent, ...prev])
    })
    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    }
    return () => es.close()
  }, [orgId])

  return { locations, scans, alerts }
}
