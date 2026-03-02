'use client'
import { useEffect } from 'react'

export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})

      // Forward online events to the service worker for environments without Background Sync
      const handleOnline = () => {
        navigator.serviceWorker.ready.then((registration) => {
          if ('sync' in registration) {
            ;(registration.sync as { register: (tag: string) => Promise<void> })
              .register('replay-queue')
              .catch(() => {})
          } else {
            registration.active?.postMessage({ type: 'ONLINE' })
          }
        })
      }

      window.addEventListener('online', handleOnline)
      return () => window.removeEventListener('online', handleOnline)
    }
  }, [])
  return null
}
