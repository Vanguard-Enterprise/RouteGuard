'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2, ArrowUpDown } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
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
import { Button } from '@/components/ui/button'
import { api, Device } from '@/lib/api'
import { AdminDataTable } from '@/components/admin/admin-data-table'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  provisioned: { label: 'Provisioned', className: 'bg-green-50 text-green-700 border-green-200' },
  unprovisioned: { label: 'Unprovisioned', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  decommissioned: { label: 'Decommissioned', className: 'bg-red-50 text-red-700 border-red-200' },
}

interface DeviceTableProps {
  devices: Device[]
}

export default function DeviceTable({ devices: initial }: DeviceTableProps) {
  const [devices, setDevices] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.admin.devices.delete(deleteTarget.id)
      setDevices((prev) => prev.filter((d) => d.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      alert('Failed to delete device.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnDef<Device>[] = [
    {
      accessorKey: 'serial',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Serial
          <ArrowUpDown className="ml-2 size-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.serial}</span>
      ),
    },
    {
      accessorKey: 'org_id',
      header: 'Org',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.original.org_id ? row.original.org_id.slice(0, 8) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Status
          <ArrowUpDown className="ml-2 size-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const statusStyle = STATUS_STYLES[row.original.status] ?? {
          label: row.original.status,
          className: 'bg-gray-100 text-gray-600 border-gray-200',
        }
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusStyle.className}`}
          >
            {statusStyle.label}
          </span>
        )
      },
    },
    {
      accessorKey: 'vehicle_id',
      header: 'Vehicle',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.vehicle_id ? row.original.vehicle_id.slice(0, 8) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'provisioned_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Provisioned
          <ArrowUpDown className="ml-2 size-3.5" />
        </Button>
      ),
      cell: ({ row }) =>
        row.original.provisioned_at
          ? new Date(row.original.provisioned_at).toLocaleDateString()
          : '—',
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => (
        <button
          onClick={() => setDeleteTarget(row.original)}
          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ]

  return (
    <div>
      <AdminDataTable
        columns={columns}
        data={devices}
        toolbar={
          <Link
            href="/admin/devices/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            Create Device
          </Link>
        }
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete device <strong>{deleteTarget?.serial}</strong>. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
