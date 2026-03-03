'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, APIError, type StaffRole } from '@/lib/api'

const ALL_PERMISSIONS = [
  { value: 'orgs:read', label: 'Organizations - Read', description: 'View organizations and SSO connections' },
  { value: 'orgs:write', label: 'Organizations - Write', description: 'Create, update, and delete organizations' },
  { value: 'devices:read', label: 'Devices - Read', description: 'View devices' },
  { value: 'devices:write', label: 'Devices - Write', description: 'Create, update, and delete devices' },
  { value: 'audit:read', label: 'Audit Logs - Read', description: 'View audit logs' },
  { value: 'staff:manage', label: 'Staff - Manage', description: 'Full staff user and role management' },
]

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  permissions: z.array(z.string()),
})
type FormData = z.infer<typeof schema>

interface Props {
  role?: StaffRole
}

export function StaffRoleForm({ role }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isEdit = !!role

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: role?.name ?? '',
      permissions: role?.permissions ?? [],
    },
  })

  const selectedPermissions = watch('permissions')

  function togglePermission(value: string) {
    const current = selectedPermissions ?? []
    if (current.includes(value)) {
      setValue('permissions', current.filter((p) => p !== value))
    } else {
      setValue('permissions', [...current, value])
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      if (isEdit) {
        await api.admin.staff.roles.update(role.id, data)
        toast.success('Role updated')
      } else {
        const created = await api.admin.staff.roles.create(data)
        toast.success('Role created')
        router.push(`/admin/staff/roles/${created.id}`)
        return
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : 'Failed to save role')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!role || !confirm(`Delete role "${role.name}"?`)) return
    try {
      await api.admin.staff.roles.delete(role.id)
      toast.success('Role deleted')
      router.push('/admin/staff/roles')
    } catch {
      toast.error('Failed to delete role')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Role Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Role Name</Label>
            <Input id="name" {...register('name')} placeholder="support_agent" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ALL_PERMISSIONS.map((perm) => (
            <div key={perm.value} className="flex items-start gap-3">
              <Checkbox
                id={perm.value}
                checked={selectedPermissions?.includes(perm.value) ?? false}
                onCheckedChange={() => togglePermission(perm.value)}
              />
              <div>
                <Label htmlFor={perm.value} className="font-medium cursor-pointer">
                  {perm.label}
                </Label>
                <p className="text-xs text-muted-foreground">{perm.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Role'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        {isEdit && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={handleDelete}>
            Delete Role
          </Button>
        )}
      </div>
    </form>
  )
}
