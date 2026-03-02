'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, KeyRound } from 'lucide-react'
import SetPinModal from '@/components/dashboard/set-pin-modal'

interface DriverDetailActionsProps {
  driverId: string
}

export default function DriverDetailActions({ driverId }: DriverDetailActionsProps) {
  const [pinOpen, setPinOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setPinOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <KeyRound size={14} />
        Set PIN
      </button>
      <Link
        href={`/dashboard/drivers/${driverId}/edit`}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
        style={{ backgroundColor: 'var(--color-brand-navy)' }}
      >
        <Pencil size={14} />
        Edit
      </Link>
      <SetPinModal driverId={driverId} open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  )
}
