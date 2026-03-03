'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DataTable, ColumnDef } from '@/components/dashboard/data-table'
import { api, Device } from '@/lib/api'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700 border-green-200' },
  unclaimed: { label: 'Unclaimed', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  revoked: { label: 'Revoked', className: 'bg-red-50 text-red-700 border-red-200' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, className: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.className}`}>
      {s.label}
    </span>
  )
}

export default function DeviceTable({ devices: initial }: { devices: Device[] }) {
  const [devices, setDevices] = useState(initial)
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? devices.filter((d) => d.serial.toLowerCase().includes(search.toLowerCase()))
    : devices

  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await api.devices.revoke(revokeTarget.id)
      setDevices((prev) =>
        prev.map((d) => (d.id === revokeTarget.id ? { ...d, status: 'revoked' as const } : d)),
      )
      setRevokeTarget(null)
    } catch {
      alert('Failed to revoke device.')
    } finally {
      setRevoking(false)
    }
  }

  const columns: ColumnDef<Device>[] = [
    {
      key: 'serial',
      header: 'Serial',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{row.serial}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'provisioned_at',
      header: 'Provisioned',
      render: (row) =>
        row.provisioned_at
          ? new Date(row.provisioned_at).toLocaleDateString()
          : '-',
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/dashboard/devices/${row.id}`}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors text-xs"
          >
            View
          </Link>
          {row.status !== 'revoked' && (
            <button
              onClick={() => setRevokeTarget(row)}
              className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
              title="Revoke"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Devices
        </h2>
        <Link
          href="/dashboard/devices/claim"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Add Device
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search by serial..."
        onSearch={setSearch}
        searchValue={search}
      />

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke device?</AlertDialogTitle>
            <AlertDialogDescription>
              Device <strong>{revokeTarget?.serial}</strong> will be immediately locked out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={revoking}
              className="bg-destructive hover:bg-destructive/90"
            >
              {revoking ? 'Revoking...' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
