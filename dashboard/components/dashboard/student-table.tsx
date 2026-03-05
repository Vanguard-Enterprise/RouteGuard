'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Upload, Pencil, Trash2 } from 'lucide-react'
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
import { api, Student } from '@/lib/api'

interface StudentTableProps {
  students: Student[]
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
  }
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  )
}

export default function StudentTable({ students: initial }: StudentTableProps) {
  const router = useRouter()
  const [students, setStudents] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? students.filter(
        (s) =>
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          (s.student_number ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : students

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.students.delete(deleteTarget.id)
      setStudents((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch {
      alert('Failed to delete student.')
    } finally {
      setDeleting(false)
    }
  }

  const columns: ColumnDef<Student>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <Link
          href={`/dashboard/students/${row.id}`}
          className="font-medium hover:underline"
          style={{ color: 'var(--color-brand-navy)' }}
        >
          {row.first_name} {row.last_name}
        </Link>
      ),
    },
    {
      key: 'grade',
      header: 'Grade',
      render: (row) => row.grade ?? '—',
    },
    {
      key: 'school_id',
      header: 'School',
      render: (row) => (
        <span className="text-sm text-gray-700">
          {row.school_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'rfid_tag_id',
      header: 'RFID',
      render: (row) => (row.rfid_tag_id ? '•••' : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Link
            href={`/dashboard/students/${row.id}/edit`}
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
          Students
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/students/import"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Upload size={15} />
            Import CSV
          </Link>
          <Link
            href="/dashboard/students/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            <Plus size={15} />
            Add Student
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        searchPlaceholder="Search students…"
        onSearch={setSearch}
        searchValue={search}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete student?</AlertDialogTitle>
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
    </div>
  )
}
