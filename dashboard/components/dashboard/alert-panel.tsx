'use client'

import { ShieldAlert, WifiOff, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { AlertEvent } from '@/hooks/use-trip-stream'

interface AlertPanelProps {
  alerts: AlertEvent[]
  onDismiss: (idx: number) => void
}

function timeAgo(timestamp: string): string {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const alertConfig = {
  unauthorized_scan: {
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50',
    labelColor: 'text-red-700',
    messageColor: 'text-red-600',
    icon: ShieldAlert,
    iconColor: 'text-red-500',
    label: 'Unauthorized Scan',
  },
  bus_offline: {
    borderColor: 'border-l-orange-500',
    bgColor: 'bg-orange-50',
    labelColor: 'text-orange-700',
    messageColor: 'text-orange-600',
    icon: WifiOff,
    iconColor: 'text-orange-500',
    label: 'Bus Offline',
  },
  route_deviation: {
    borderColor: 'border-l-yellow-500',
    bgColor: 'bg-yellow-50',
    labelColor: 'text-yellow-700',
    messageColor: 'text-yellow-600',
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    label: 'Route Deviation',
  },
}

export default function AlertPanel({ alerts, onDismiss }: AlertPanelProps) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700">Alerts</p>
      </div>
      <div className="overflow-y-auto max-h-72">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
            <CheckCircle2 size={20} className="text-green-400" />
            <p className="text-xs">No alerts</p>
          </div>
        ) : (
          <ul className="p-2 space-y-1.5">
            {alerts.map((alert, idx) => {
              const cfg = alertConfig[alert.type]
              const Icon = cfg.icon
              return (
                <li
                  key={`${alert.timestamp}-${idx}`}
                  className={`flex items-start gap-3 p-3 border-l-2 ${cfg.borderColor} ${cfg.bgColor} rounded-r`}
                >
                  <Icon size={16} className={`${cfg.iconColor} mt-0.5 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${cfg.labelColor}`}>{cfg.label}</p>
                    <p className={`text-xs ${cfg.messageColor} mt-0.5 truncate`}>{alert.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{timeAgo(alert.timestamp)}</p>
                  </div>
                  <button
                    onClick={() => onDismiss(idx)}
                    className="text-gray-400 hover:text-red-600 shrink-0 text-base leading-none"
                    aria-label="Dismiss alert"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
