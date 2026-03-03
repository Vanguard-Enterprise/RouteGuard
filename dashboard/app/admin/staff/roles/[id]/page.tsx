import { notFound } from 'next/navigation'
import { api, APIError } from '@/lib/api'
import { StaffRoleForm } from '@/components/admin/staff-role-form'
import { Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function EditStaffRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const role = await api.admin.staff.roles.get(id).catch((err) => {
    if (err instanceof APIError && err.status === 404) return null
    throw err
  })
  if (!role) notFound()

  if (role.is_system) {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{role.name}</h1>
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          System roles cannot be modified. This role always has all permissions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit Role</h1>
      </div>
      <StaffRoleForm role={role} />
    </div>
  )
}
