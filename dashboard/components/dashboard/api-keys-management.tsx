'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Copy, Check } from 'lucide-react'
import { api, APIKey } from '@/lib/api'
import { DataTable, ColumnDef } from '@/components/dashboard/data-table'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const AVAILABLE_SCOPES = [
  'trips:read',
  'trips:write',
  'students:read',
  'students:write',
  'routes:read',
  'routes:write',
  'reports:read',
]

interface CreatedKey {
  apiKey: APIKey
  key: string
}

export default function APIKeysManagement() {
  const [keys, setKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<APIKey | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState(false)

  const [newName, setNewName] = useState('')
  const [newScopes, setNewScopes] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    api.settings.apiKeys
      .list()
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    setCreateError(null)
    if (!newName.trim()) {
      setCreateError('Name is required.')
      return
    }
    if (newScopes.length === 0) {
      setCreateError('Select at least one scope.')
      return
    }
    setCreating(true)
    try {
      const result = await api.settings.apiKeys.create(newName.trim(), newScopes)
      setKeys((prev) => [result.api_key, ...prev])
      setCreatedKey({ apiKey: result.api_key, key: result.key })
      setShowCreate(false)
      setNewName('')
      setNewScopes([])
    } catch {
      setCreateError('Failed to create API key.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.settings.apiKeys.delete(deleteTarget.id)
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      alert('Failed to delete API key.')
    } finally {
      setDeleting(false)
    }
  }

  function toggleScope(scope: string) {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const columns: ColumnDef<APIKey>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium">{row.name}</span> },
    { key: 'key_prefix', header: 'Prefix', render: (row) => <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{row.key_prefix}…</code> },
    {
      key: 'scopes',
      header: 'Scopes',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.scopes.map((s) => (
            <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              {s}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'last_used_at',
      header: 'Last Used',
      render: (row) => (row.last_used_at ? new Date(row.last_used_at).toLocaleDateString() : '—'),
    },
    {
      key: 'expires_at',
      header: 'Expires',
      render: (row) => (row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Never'),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (row) => (
        <button
          onClick={() => setDeleteTarget(row)}
          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          API Keys
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Create API Key
        </button>
      </div>

      <DataTable columns={columns} data={keys} loading={loading} rowKey={(row) => row.id} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-100 shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
              Create API Key
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  placeholder="My Integration"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scopes <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="rounded"
                      />
                      <span className="text-gray-700">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: 'var(--color-brand-navy)' }}
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false)
                    setNewName('')
                    setNewScopes([])
                    setCreateError(null)
                  }}
                  className="flex-1 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Copy your API key now. It will not be shown again.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-gray-800 break-all">
                {createdKey?.key}
              </code>
              <button
                onClick={() => createdKey && copyKey(createdKey.key)}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
                title="Copy"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="w-full py-2 rounded-md text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. Any integrations
              using this key will stop working.
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
