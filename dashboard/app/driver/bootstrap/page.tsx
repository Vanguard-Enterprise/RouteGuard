'use client'
import { useEffect } from 'react'

export default function DeviceBootstrap() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      localStorage.setItem('device_token', token)
    }
    window.location.replace('/driver')
  }, [])

  return null
}
