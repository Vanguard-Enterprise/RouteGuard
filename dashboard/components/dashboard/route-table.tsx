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
import { api, Route } from '@/lib/api'

interface RouteTableProps {
  routes: Route[]
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    archived: 'bg-gray-100 text-gray-500',
  }
  const cls = styles[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    midday: 'Midday',
    special: 'Special',
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 capitalize">
      {labels[type] ?? type}
    </span>
  )
}

export default function RouteTable({ routes: initial }: RouteTableProps) {
  const router = useRouter()
  const [routes, setRoutes] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? routes.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.type.toLowerCase().includes(search.toLowerCase()) ||
          r.status.toLowerCase().includes(search.toLowerCase()),
      )
    : routes

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.routes.delete(deleteTarget.id)
      setRoutes((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch {
      alert('Failed to delete route.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnDef<Route>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <Link
          href={`/dashboard/routes/${row.id}`}
          className="font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <TypeBadge type={row.type} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'estimated_duration_min',
      header: 'Est. Duration',
      render: (row) =>
        row.estimated_duration_min != null ? `${row.estimated_duration_min} min` : '—',
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/routes/${row.id}/edit`}
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
          Routes
        </h2>
        <Link
          href="/dashboard/routes/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Add Route
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search routes…"
        onSearch={setSearch}
        searchValue={search}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route?</AlertDialogTitle>
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
