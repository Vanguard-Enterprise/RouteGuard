'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function RestoreUserButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleRestore() {
    setLoading(true)
    try {
      await api.admin.staff.users.restore(userId)
      toast.success('User restored')
      router.refresh()
    } catch {
      toast.error('Failed to restore user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRestore} disabled={loading}>
      Restore
    </Button>
  )
}
