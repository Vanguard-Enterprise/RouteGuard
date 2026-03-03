import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function StaffRolesPage() {
  const roles = await api.admin.staff.roles.list()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define permission sets for RouteGuard staff
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/staff/roles/new">New Role</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {role.name}
                  {role.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {!role.is_system && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/staff/roles/${role.id}`}>Edit</Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
