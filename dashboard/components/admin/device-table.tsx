'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { api, Device } from '@/lib/api'

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Devices
        </h2>
        <Link
          href="/admin/devices/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Create Device
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial</TableHead>
              <TableHead>Org</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Provisioned</TableHead>
              <TableHead className="w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                  No devices yet.
                </TableCell>
              </TableRow>
            )}
            {devices.map((device) => {
              const statusStyle = STATUS_STYLES[device.status] ?? {
                label: device.status,
                className: 'bg-gray-100 text-gray-600 border-gray-200',
              }
              return (
                <TableRow key={device.id}>
                  <TableCell className="font-mono text-sm">{device.serial}</TableCell>
                  <TableCell className="text-sm text-gray-500 font-mono">
                    {device.org_id ? device.org_id.slice(0, 8) : '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusStyle.className}`}
                    >
                      {statusStyle.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {device.vehicle_id ? device.vehicle_id.slice(0, 8) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {device.provisioned_at ? new Date(device.provisioned_at).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => setDeleteTarget(device)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

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
