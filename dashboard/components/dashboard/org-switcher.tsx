'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, type OrgOption } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface OrgSwitcherProps {
  currentOrg: OrgOption
  userName: string
}

export function OrgSwitcher({ currentOrg, userName }: OrgSwitcherProps) {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.auth.orgs().then(setOrgs).catch(() => {})
  }, [])

  async function handleSwitch(orgId: string) {
    if (orgId === currentOrg.id) return
    setLoading(true)
    try {
      await api.auth.switchOrg(orgId)
      router.refresh()
    } catch {
      toast.error('Failed to switch organization.')
    } finally {
      setLoading(false)
    }
  }

  // Don't show switcher if user only has one org
  if (orgs.length <= 1) {
    return (
      <span className="text-sm text-muted-foreground">{currentOrg.name}</span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={loading} className="gap-1">
          {currentOrg.name}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-50">
            <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {orgs.map(org => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            className={org.id === currentOrg.id ? 'font-semibold' : ''}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
