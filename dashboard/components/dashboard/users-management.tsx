'use client'

import { useState, useEffect } from 'react'
import { api, User, OrgRole } from '@/lib/api'
import { DataTable, ColumnDef } from '@/components/dashboard/data-table'

interface UserWithRoles extends User {
  roles: OrgRole[]
}

export default function UsersManagement() {
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [allRoles, setAllRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [fetchedUsers, fetchedRoles] = await Promise.all([
          api.settings.users.list(),
          api.settings.roles.list(),
        ])
        setAllRoles(fetchedRoles)
        const usersWithRoles = await Promise.all(
          fetchedUsers.map(async (u) => {
            try {
              const roles = await api.settings.users.roles.list(u.id)
              return { ...u, roles }
            } catch {
              return { ...u, roles: [] }
            }
          }),
        )
        setUsers(usersWithRoles)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleAssignRole(userId: string, roleId: string) {
    if (!roleId) return
    setAssigning(userId)
    try {
      await api.settings.users.roles.assign(userId, roleId)
      const roles = await api.settings.users.roles.list(userId)
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles } : u)))
    } catch {
      alert('Failed to assign role.')
    } finally {
      setAssigning(null)
    }
  }

  async function handleUnassignRole(userId: string, roleId: string) {
    setAssigning(userId)
    try {
      await api.settings.users.roles.unassign(userId, roleId)
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, roles: u.roles.filter((r) => r.id !== roleId) } : u,
        ),
      )
    } catch {
      alert('Failed to remove role.')
    } finally {
      setAssigning(null)
    }
  }

  const columns: ColumnDef<UserWithRoles>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-medium text-gray-800">{row.name}</span>,
    },
    { key: 'email', header: 'Email', render: (row) => row.email },
    {
      key: 'roles',
      header: 'Roles',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.map((role) => (
            <span
              key={role.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700"
            >
              {role.name}
              <button
                onClick={() => handleUnassignRole(row.id, role.id)}
                disabled={assigning === row.id}
                className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
                title="Remove role"
              >
                ×
              </button>
            </span>
          ))}
          {row.roles.length === 0 && (
            <span className="text-xs text-gray-400">No roles</span>
          )}
        </div>
      ),
    },
    {
      key: 'assign',
      header: 'Assign Role',
      className: 'w-48',
      render: (row) => {
        const unassignedRoles = allRoles.filter(
          (r) => !row.roles.some((ur) => ur.id === r.id),
        )
        return (
          <select
            disabled={assigning === row.id || unassignedRoles.length === 0}
            onChange={(e) => handleAssignRole(row.id, e.target.value)}
            value=""
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white outline-none focus:border-blue-400 transition disabled:opacity-60"
          >
            <option value="" disabled>
              {unassignedRoles.length === 0 ? 'All assigned' : 'Add role…'}
            </option>
            {unassignedRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )
      },
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Users
        </h2>
      </div>
      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        rowKey={(row) => row.id}
        searchPlaceholder="Search users…"
      />
    </div>
  )
}
