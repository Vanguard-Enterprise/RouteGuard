'use client'
import { UserCheck, UserMinus, AlertCircle, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface ScanEvent {
  id: string
  rfid_tag_id: string
  student_name?: string
  scan_type: 'board' | 'exit' | 'unauthorized'
  timestamp: number
}

interface StudentScanListProps {
  scans: ScanEvent[]
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

const SCAN_CONFIG = {
  board: {
    Icon: UserCheck,
    iconClass: 'text-green-600',
    badgeClass: 'bg-green-100 text-green-700 border-green-300',
    label: 'Boarded',
  },
  exit: {
    Icon: UserMinus,
    iconClass: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-300',
    label: 'Exited',
  },
  unauthorized: {
    Icon: AlertCircle,
    iconClass: 'text-destructive',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/30',
    label: 'Unknown',
  },
}

export default function StudentScanList({ scans }: StudentScanListProps) {
  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Users className="size-8" />
        <p className="text-sm">Awaiting scans for this stop</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {scans.map((scan) => {
        const cfg = SCAN_CONFIG[scan.scan_type]
        return (
          <div
            key={scan.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <cfg.Icon className={`size-5 shrink-0 ${cfg.iconClass}`} />
            <span className="flex-1 text-foreground text-sm font-medium">
              {scan.student_name ?? (
                <span className="text-muted-foreground italic">Unknown</span>
              )}
            </span>
            <Badge className={`text-xs ${cfg.badgeClass}`} variant="outline">
              {cfg.label}
            </Badge>
            <span className="text-muted-foreground text-xs tabular-nums">
              {timeAgo(scan.timestamp)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
