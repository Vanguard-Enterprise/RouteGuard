'use client'
import dynamic from 'next/dynamic'

const FreeDriveMap = dynamic(() => import('@/components/driver/free-drive-map'), { ssr: false })

export default function FreeDriveMapPage() {
  return <FreeDriveMap />
}
