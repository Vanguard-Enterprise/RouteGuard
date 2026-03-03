import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RestoreUserButton } from '@/components/admin/restore-user-button'

export const dynamic = 'force-dynamic'

export default async function StaffUsersPage() {
  const users = await api.admin.staff.users.list()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RouteGuard internal staff accounts
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/staff/users/new">Add Staff User</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className={user.deleted_at ? 'opacity-60' : ''}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role.id} variant="secondary">
                      {role.name}
                    </Badge>
                  ))}
                  {user.roles.length === 0 && (
                    <span className="text-muted-foreground text-xs">No roles</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {user.last_login_at
                  ? new Date(user.last_login_at).toLocaleDateString()
                  : 'Never'}
              </TableCell>
              <TableCell>
                {user.deleted_at ? (
                  <Badge variant="destructive">
                    Deleted - removes in {user.days_until_deletion}d
                  </Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {user.deleted_at ? (
                  <RestoreUserButton userId={user.id} />
                ) : (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/staff/users/${user.id}`}>Edit</Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No staff users yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
