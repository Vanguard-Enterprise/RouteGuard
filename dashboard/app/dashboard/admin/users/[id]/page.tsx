"use client"

import { use } from "react"
import Link from "next/link"
import useSWR from "swr"
import { api, PlatformUserDetail } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleString()
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: user, mutate, isLoading } = useSWR<PlatformUserDetail>(
    id ? ["platform-user", id] : null,
    () => api.platform.users.get(id)
  )

  const handleDisableEnable = async () => {
    if (!user) return
    const action = user.disabled_at ? "enable" : "disable"
    if (!window.confirm(`${action === "disable" ? "Disable" : "Enable"} this user?`)) return
    try {
      if (action === "disable") {
        await api.platform.users.disable(id)
        toast.success("User disabled")
      } else {
        await api.platform.users.enable(id)
        toast.success("User enabled")
      }
      mutate()
    } catch {
      toast.error(`Failed to ${action} user`)
    }
  }

  const handleResetPassword = async () => {
    if (!window.confirm("Force a password reset for this user?")) return
    try {
      await api.platform.users.resetPassword(id)
      toast.success("Password reset email sent")
    } catch {
      toast.error("Failed to send password reset")
    }
  }

  const handleRevokeSessions = async () => {
    if (!window.confirm("Revoke all active sessions for this user?")) return
    try {
      await api.platform.users.revokeSessions(id)
      toast.success("All sessions revoked")
    } catch {
      toast.error("Failed to revoke sessions")
    }
  }

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  if (!user) {
    return <div className="p-6 text-muted-foreground">User not found</div>
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">{user.name || user.email}</h1>
        {user.disabled_at ? (
          <Badge variant="destructive">Disabled</Badge>
        ) : (
          <Badge variant="default">Active</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32">Name</span>
            <span>{user.name || "-"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32">Last Login</span>
            <span>{formatDate(user.last_login_at)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32">Created</span>
            <span>{formatDate(user.created_at)}</span>
          </div>
          {user.disabled_at && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-32">Disabled At</span>
              <span>{formatDate(user.disabled_at)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Org Memberships</CardTitle>
        </CardHeader>
        <CardContent>
          {user.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">No org memberships</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.memberships.map((m) => (
                  <TableRow key={m.org_id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/admin/orgs/${m.org_id}`}
                        className="text-primary hover:underline"
                      >
                        {m.org_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.roles.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          m.roles.map((r) => (
                            <Badge key={r.id} variant="secondary">{r.name}</Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant={user.disabled_at ? "default" : "outline"}
            onClick={handleDisableEnable}
          >
            {user.disabled_at ? "Enable User" : "Disable User"}
          </Button>
          <Button variant="outline" onClick={handleResetPassword}>
            Force Password Reset
          </Button>
          <Button variant="destructive" onClick={handleRevokeSessions}>
            Revoke All Sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
