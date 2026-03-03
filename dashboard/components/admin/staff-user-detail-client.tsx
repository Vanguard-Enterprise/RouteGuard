'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, type StaffUser, type StaffRole } from '@/lib/api'

interface Props {
  user: StaffUser
  allRoles: StaffRole[]
}

export function StaffUserDetailClient({ user, allRoles }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const assignedRoleIds = new Set(user.roles.map((r) => r.id))
  const unassignedRoles = allRoles.filter((r) => !assignedRoleIds.has(r.id))

  async function handleAssign(roleId: string) {
    setLoading(roleId)
    try {
      await api.admin.staff.users.roles.assign(user.id, roleId)
      toast.success('Role assigned')
      router.refresh()
    } catch {
      toast.error('Failed to assign role')
    } finally {
      setLoading(null)
    }
  }

  async function handleUnassign(roleId: string) {
    setLoading(roleId)
    try {
      await api.admin.staff.users.roles.unassign(user.id, roleId)
      toast.success('Role removed')
      router.refresh()
    } catch {
      toast.error('Failed to remove role')
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${user.name}? They will be permanently removed in 30 days.`)) return
    try {
      await api.admin.staff.users.delete(user.id)
      toast.success('User deleted')
      router.push('/admin/staff/users')
    } catch {
      toast.error('Failed to delete user')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        {!user.deleted_at && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            Delete User
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {user.roles.length === 0 && (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          )}
          {user.roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{role.name}</Badge>
                {role.is_system && <span className="text-xs text-muted-foreground">system</span>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={loading === role.id}
                onClick={() => handleUnassign(role.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {unassignedRoles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassignedRoles.map((role) => (
              <div key={role.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{role.name}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {role.permissions.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading === role.id}
                  onClick={() => handleAssign(role.id)}
                >
                  Assign
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
