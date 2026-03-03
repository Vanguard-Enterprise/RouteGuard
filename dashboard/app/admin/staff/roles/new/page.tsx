import { StaffRoleForm } from '@/components/admin/staff-role-form'

export default function NewStaffRolePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New Staff Role</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a custom permission set for RouteGuard staff
        </p>
      </div>
      <StaffRoleForm />
    </div>
  )
}
