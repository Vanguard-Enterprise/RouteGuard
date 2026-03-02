'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
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

interface SSOConnection {
  id: string
  provider: string
  display_name: string
  [key: string]: unknown
}

interface SSOFormState {
  provider: 'oidc' | 'saml'
  display_name: string
  issuer: string
  client_id: string
  client_secret: string
  metadata_url: string
  sso_url: string
  certificate: string
}

const EMPTY_FORM: SSOFormState = {
  provider: 'oidc',
  display_name: '',
  issuer: '',
  client_id: '',
  client_secret: '',
  metadata_url: '',
  sso_url: '',
  certificate: '',
}

export default function SSOManagement() {
  const [connections, setConnections] = useState<SSOConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<SSOFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SSOConnection | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.settings.sso
      .list()
      .then((data) => setConnections(data as SSOConnection[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    setSaveError(null)
    if (!form.display_name.trim()) {
      setSaveError('Display name is required.')
      return
    }
    setSaving(true)
    try {
      const payload =
        form.provider === 'oidc'
          ? {
              provider: form.provider,
              display_name: form.display_name,
              issuer: form.issuer,
              client_id: form.client_id,
              client_secret: form.client_secret,
            }
          : {
              provider: form.provider,
              display_name: form.display_name,
              metadata_url: form.metadata_url,
              sso_url: form.sso_url,
              certificate: form.certificate,
            }
      const created = await api.settings.sso.create(payload)
      setConnections((prev) => [...prev, created as SSOConnection])
      setForm(EMPTY_FORM)
      setShowAdd(false)
    } catch {
      setSaveError('Failed to add SSO connection.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.settings.sso.delete(deleteTarget.id)
      setConnections((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      alert('Failed to delete SSO connection.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          SSO Connections
        </h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Add Connection
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">New SSO Connection</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) =>
                setForm((f) => ({ ...f, provider: e.target.value as 'oidc' | 'saml' }))
              }
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-blue-400 transition"
            >
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition"
              placeholder="Google Workspace"
            />
          </div>

          {form.provider === 'oidc' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issuer URL</label>
                <input
                  value={form.issuer}
                  onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition"
                  placeholder="https://accounts.google.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                <input
                  value={form.client_id}
                  onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition"
                />
              </div>
            </>
          )}

          {form.provider === 'saml' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metadata URL
                </label>
                <input
                  value={form.metadata_url}
                  onChange={(e) => setForm((f) => ({ ...f, metadata_url: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition"
                  placeholder="https://idp.example.com/metadata"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SSO URL</label>
                <input
                  value={form.sso_url}
                  onChange={(e) => setForm((f) => ({ ...f, sso_url: e.target.value }))}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition"
                  placeholder="https://idp.example.com/sso"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate (PEM)
                </label>
                <textarea
                  value={form.certificate}
                  onChange={(e) => setForm((f) => ({ ...f, certificate: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 transition font-mono resize-none"
                  placeholder="-----BEGIN CERTIFICATE-----"
                />
              </div>
            </>
          )}

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {saving ? 'Adding…' : 'Add Connection'}
            </button>
            <button
              onClick={() => {
                setShowAdd(false)
                setForm(EMPTY_FORM)
                setSaveError(null)
              }}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {connections.length === 0 && !showAdd && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center text-gray-400 text-sm">
          No SSO connections configured.
        </div>
      )}

      <div className="space-y-2">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center justify-between"
          >
            <div>
              <p className="font-medium text-gray-800">{conn.display_name}</p>
              <p className="text-xs text-gray-500 mt-0.5 uppercase">{conn.provider}</p>
            </div>
            <button
              onClick={() => setDeleteTarget(conn)}
              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SSO Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <strong>{deleteTarget?.display_name}</strong>. Users relying on this SSO provider
              will not be able to log in.
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
