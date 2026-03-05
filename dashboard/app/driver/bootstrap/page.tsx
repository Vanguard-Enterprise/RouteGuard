'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function DeviceBootstrap() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      localStorage.setItem('device_token', token)
    }
    router.replace('/driver')
  }, [params, router])

  return null
}
