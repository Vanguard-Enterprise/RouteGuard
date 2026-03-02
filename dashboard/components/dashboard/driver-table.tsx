'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react'
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
import SetPinModal from '@/components/dashboard/set-pin-modal'
import { api, Driver } from '@/lib/api'

interface DriverTableProps {
  drivers: Driver[]
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
  }
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}

function maskLicense(license: string | null): string {
  if (!license) return '—'
  if (license.length <= 4) return '•'.repeat(license.length)
  return '••••' + license.slice(-4)
}

export default function DriverTable({ drivers: initial }: DriverTableProps) {
  const router = useRouter()
  const [drivers, setDrivers] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pinTarget, setPinTarget] = useState<Driver | null>(null)
  const [search, setSearch] = useState('')

  const filtered = search
    ? drivers.filter(
        (d) =>
          `${d.first_name} ${d.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          (d.phone ?? '').includes(search),
      )
    : drivers

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.drivers.delete(deleteTarget.id)
      setDrivers((prev) => prev.filter((d) => d.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch {
      alert('Failed to delete driver.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnDef<Driver>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <Link
          href={`/dashboard/drivers/${row.id}`}
          className="font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {row.first_name} {row.last_name}
        </Link>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => row.phone ?? '—',
    },
    {
      key: 'license_number',
      header: 'License #',
      render: (row) => (
        <span className="font-mono text-sm">{maskLicense(row.license_number)}</span>
      ),
    },
    {
      key: 'license_expiry',
      header: 'Expiry',
      render: (row) =>
        row.license_expiry
          ? new Date(row.license_expiry).toLocaleDateString()
          : '—',
    },
    {
      key: 'rfid_badge_id',
      header: 'RFID Badge',
      render: (row) => (row.rfid_badge_id ? '•••••••' : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-28',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPinTarget(row)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Set PIN"
          >
            <KeyRound size={15} />
          </button>
          <Link
            href={`/dashboard/drivers/${row.id}/edit`}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Edit"
          >
            <Pencil size={15} />
          </Link>
          <button
            onClick={() => setDeleteTarget(row)}
            className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Drivers
        </h2>
        <Link
          href="/dashboard/drivers/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Add Driver
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search drivers…"
        onSearch={setSearch}
        searchValue={search}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete driver?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <strong>
                {deleteTarget?.first_name} {deleteTarget?.last_name}
              </strong>
              . This action cannot be undone.
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

      {pinTarget && (
        <SetPinModal
          driverId={pinTarget.id}
          open={!!pinTarget}
          onClose={() => setPinTarget(null)}
        />
      )}
    </div>
  )
}
