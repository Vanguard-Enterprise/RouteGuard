'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Shield } from 'lucide-react'
import { api, OrgRole } from '@/lib/api'
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

const PRESET_ROLES = [
  {
    name: 'School Admin',
    description: 'Read-only monitoring for school administrators.',
    permissions: ['trips:read', 'students:read', 'routes:read', 'reports:read'],
  },
  {
    name: 'Dispatcher',
    description: 'Trip operations - manage and track active trips.',
    permissions: ['trips:read', 'trips:write', 'routes:read', 'drivers:read', 'vehicles:read'],
  },
  {
    name: 'Routing Specialist',
    description: 'Route and student management - build and maintain routes.',
    permissions: [
      'routes:read', 'routes:write',
      'students:read', 'students:write',
      'schools:read', 'schools:write',
      'drivers:read', 'vehicles:read',
    ],
  },
  {
    name: 'Fleet Manager',
    description: 'Vehicle and driver management for fleet operations.',
    permissions: ['vehicles:read', 'vehicles:write', 'drivers:read', 'reports:read'],
  },
]

const AVAILABLE_PERMISSIONS = [
  'schools:read',
  'schools:write',
  'students:read',
  'students:write',
  'drivers:read',
  'drivers:write',
  'vehicles:read',
  'vehicles:write',
  'routes:read',
  'routes:write',
  'trips:read',
  'trips:write',
  'reports:read',
  'settings:read',
  'settings:write',
]

interface RoleFormProps {
  role?: OrgRole
  onSave: (name: string, permissions: string[]) => Promise<void>
  onCancel: () => void
  saving: boolean
  error: string | null
}

function RoleForm({ role, onSave, onCancel, saving, error }: RoleFormProps) {
  const [name, setName] = useState(role?.name ?? '')
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? [])

  function toggle(perm: string) {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Role Name <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          placeholder="Custom Admin"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {AVAILABLE_PERMISSIONS.map((perm) => (
            <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.includes(perm)}
                onChange={() => toggle(perm)}
                className="rounded"
              />
              <span className="text-gray-700">{perm}</span>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => onSave(name, permissions)}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          {saving ? 'Saving…' : role ? 'Save Changes' : 'Create Role'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function RolesManagement() {
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<OrgRole | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrgRole | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [creatingPreset, setCreatingPreset] = useState<string | null>(null)

  useEffect(() => {
    api.settings.roles
      .list()
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(name: string, permissions: string[]) {
    setSaveError(null)
    if (!name.trim()) {
      setSaveError('Role name is required.')
      return
    }
    setSaving(true)
    try {
      const created = await api.settings.roles.create({ name: name.trim(), permissions })
      setRoles((prev) => [...prev, created])
      setShowCreate(false)
    } catch {
      setSaveError('Failed to create role.')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(name: string, permissions: string[]) {
    if (!editTarget) return
    setSaveError(null)
    if (!name.trim()) {
      setSaveError('Role name is required.')
      return
    }
    setSaving(true)
    try {
      const updated = await api.settings.roles.update(editTarget.id, {
        name: name.trim(),
        permissions,
      })
      setRoles((prev) => prev.map((r) => (r.id === editTarget.id ? updated : r)))
      setEditTarget(null)
    } catch {
      setSaveError('Failed to update role.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddPreset(preset: (typeof PRESET_ROLES)[number]) {
    setCreatingPreset(preset.name)
    try {
      const created = await api.settings.roles.create({
        name: preset.name,
        permissions: preset.permissions,
      })
      setRoles((prev) => [...prev, created])
    } catch {
      // silently fail - role list will not update
    } finally {
      setCreatingPreset(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.settings.roles.delete(deleteTarget.id)
      setRoles((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      alert('Failed to delete role.')
    } finally {
      setDeleting(false)
    }
  }

  const systemRoles = roles.filter((r) => r.is_system)
  const customRoles = roles.filter((r) => !r.is_system)

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Roles
        </h2>
        <button
          onClick={() => {
            setShowCreate(true)
            setEditTarget(null)
            setSaveError(null)
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={15} />
          Create Role
        </button>
      </div>

      {showCreate && (
        <RoleForm
          onSave={handleCreate}
          onCancel={() => {
            setShowCreate(false)
            setSaveError(null)
          }}
          saving={saving}
          error={saveError}
        />
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Preset Roles
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRESET_ROLES.map((preset) => {
            const exists = roles.some((r) => r.name === preset.name)
            const isCreating = creatingPreset === preset.name
            return (
              <div
                key={preset.name}
                className="bg-white border border-gray-100 rounded-xl px-5 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{preset.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
                  </div>
                  <button
                    onClick={() => !exists && !isCreating && handleAddPreset(preset)}
                    disabled={exists || isCreating}
                    className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60"
                    style={
                      exists
                        ? { border: '1px solid #e5e7eb', color: '#9ca3af' }
                        : { backgroundColor: 'var(--color-brand-navy)', color: 'white' }
                    }
                  >
                    {exists ? 'Already added' : isCreating ? 'Adding...' : 'Add to org'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {preset.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {systemRoles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            System Roles
          </h3>
          <div className="space-y-2">
            {systemRoles.map((role) => (
              <div
                key={role.id}
                className="bg-white border border-gray-100 rounded-xl px-5 py-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={15} className="text-gray-400" />
                  <span className="font-medium text-gray-800">{role.name}</span>
                  <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    System
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded"
                    >
                      {perm}
                    </span>
                  ))}
                  {role.permissions.length === 0 && (
                    <span className="text-xs text-gray-400">No permissions</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Custom Roles
        </h3>
        {customRoles.length === 0 && !showCreate ? (
          <p className="text-sm text-gray-400">No custom roles yet.</p>
        ) : (
          <div className="space-y-2">
            {customRoles.map((role) => (
              <div key={role.id}>
                {editTarget?.id === role.id ? (
                  <RoleForm
                    role={role}
                    onSave={handleEdit}
                    onCancel={() => {
                      setEditTarget(null)
                      setSaveError(null)
                    }}
                    saving={saving}
                    error={saveError}
                  />
                ) : (
                  <div className="bg-white border border-gray-100 rounded-xl px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-800">{role.name}</span>
                      <div className="ml-auto flex gap-1">
                        <button
                          onClick={() => {
                            setEditTarget(role)
                            setShowCreate(false)
                            setSaveError(null)
                          }}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(role)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded"
                        >
                          {perm}
                        </span>
                      ))}
                      {role.permissions.length === 0 && (
                        <span className="text-xs text-gray-400">No permissions</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the role <strong>{deleteTarget?.name}</strong>. Users
              with this role will lose its permissions.
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
