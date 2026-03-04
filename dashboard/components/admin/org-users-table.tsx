'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
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
import { api, type OrgUser } from '@/lib/api'

interface OrgUsersTableProps {
  orgId: string
  initialUsers: OrgUser[]
}

export function OrgUsersTable({ orgId, initialUsers }: OrgUsersTableProps) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [deleteTarget, setDeleteTarget] = useState<OrgUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.admin.organizations.users.delete(orgId, deleteTarget.id)
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove user.'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-gray-500 text-sm mb-4">No users yet. Add the first admin user to get this org started.</p>
        <Link
          href={`/admin/organizations/${orgId}/users/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <UserPlus size={14} />
          Add First User
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {users.map((user) => (
          <div key={user.id} className="flex items-center px-5 py-3 gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  {user.last_login_at
                    ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}`
                    : 'Never logged in'}
                </p>
                <p className="text-xs text-gray-400">
                  Added {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(user)}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove user"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) and their account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
