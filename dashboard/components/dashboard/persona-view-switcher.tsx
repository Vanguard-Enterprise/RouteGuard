'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type Persona =
  | 'admin'
  | 'school_admin'
  | 'dispatcher'
  | 'routing_specialist'
  | 'fleet_manager'

export const PERSONA_LABELS: Record<Persona, string> = {
  admin: 'Admin',
  school_admin: 'School Admin',
  dispatcher: 'Dispatcher',
  routing_specialist: 'Routing Specialist',
  fleet_manager: 'Fleet Manager',
}

interface PersonaViewSwitcherProps {
  current: Persona
  natural: Persona
}

export function PersonaViewSwitcher({ current, natural }: PersonaViewSwitcherProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={current}
        onValueChange={(v) => router.push(`/dashboard?view=${v}`)}
      >
        <SelectTrigger className="w-48 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
            <SelectItem key={p} value={p}>
              {PERSONA_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current !== natural && (
        <span className="text-xs text-muted-foreground">
          Viewing as: {PERSONA_LABELS[current]}
        </span>
      )}
    </div>
  )
}
