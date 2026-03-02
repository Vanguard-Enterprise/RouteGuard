'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2 } from 'lucide-react'
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
import { api, Vehicle } from '@/lib/api'

interface VehicleTableProps {
  vehicles: Vehicle[]
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    maintenance: 'bg-amber-100 text-amber-700',
    retired: 'bg-red-100 text-red-700',
  }
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}

export default function VehicleTable({ vehicles: initial }: VehicleTableProps) {
  const router = useRouter()
  const [vehicles, setVehicles] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? vehicles.filter(
        (v) =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          (v.number ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (v.make ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (v.model ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (v.license_plate ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : vehicles

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.vehicles.delete(deleteTarget.id)
      setVehicles((prev) => prev.filter((v) => v.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch {
      alert('Failed to delete vehicle.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnDef<Vehicle>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <Link
          href={`/dashboard/vehicles/${row.id}`}
          className="font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: 'number',
      header: 'Number',
      render: (row) => row.number ?? '—',
    },
    {
      key: 'make',
      header: 'Make',
      render: (row) => row.make ?? '—',
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => row.model ?? '—',
    },
    {
      key: 'year',
      header: 'Year',
      render: (row) => (row.year != null ? String(row.year) : '—'),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (row) => (row.capacity != null ? String(row.capacity) : '—'),
    },
    {
      key: 'license_plate',
      header: 'License Plate',
      render: (row) => row.license_plate ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/vehicles/${row.id}/edit`}
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
          Vehicles
        </h2>
        <Link
          href="/dashboard/vehicles/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Add Vehicle
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search vehicles…"
        onSearch={setSearch}
        searchValue={search}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. This action cannot
              be undone.
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
