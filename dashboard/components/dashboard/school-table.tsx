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
import { api, School } from '@/lib/api'

interface SchoolTableProps {
  schools: School[]
}

export default function SchoolTable({ schools: initial }: SchoolTableProps) {
  const router = useRouter()
  const [schools, setSchools] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? schools.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.city ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (s.contact_name ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : schools

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.schools.delete(deleteTarget.id)
      setSchools((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch {
      alert('Failed to delete school.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnDef<School>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <Link
          href={`/dashboard/schools/${row.id}`}
          className="font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: 'city',
      header: 'City',
      render: (row) => row.city ?? '—',
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => row.state ?? '—',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => row.phone ?? '—',
    },
    {
      key: 'contact_name',
      header: 'Contact',
      render: (row) => row.contact_name ?? '—',
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/schools/${row.id}/edit`}
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
          Schools
        </h2>
        <Link
          href="/dashboard/schools/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Add School
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search schools…"
        onSearch={setSearch}
        searchValue={search}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete school?</AlertDialogTitle>
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
