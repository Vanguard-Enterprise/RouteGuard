"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import { api, PlatformUser, PageResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  return new Date(dateStr).toLocaleDateString()
}

export default function UsersPage() {
  const [emailInput, setEmailInput] = useState("")
  const [debouncedEmail, setDebouncedEmail] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(emailInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [emailInput])

  const { data, mutate, isLoading } = useSWR<PageResponse<PlatformUser>>(
    ["platform-users", debouncedEmail, page],
    () => api.platform.users.list({ email: debouncedEmail || undefined, page, per_page: 25 })
  )

  const handleDisableEnable = useCallback(async (user: PlatformUser) => {
    const action = user.disabled_at ? "enable" : "disable"
    const confirmed = window.confirm(`${action === "disable" ? "Disable" : "Enable"} ${user.name || user.email}?`)
    if (!confirmed) return
    try {
      if (action === "disable") {
        await api.platform.users.disable(user.id)
        toast.success("User disabled")
      } else {
        await api.platform.users.enable(user.id)
        toast.success("User enabled")
      }
      mutate()
    } catch {
      toast.error(`Failed to ${action} user`)
    }
  }, [mutate])

  const users = data?.items ?? []
  const totalPages = data?.total_pages ?? 1

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Search by email..."
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name || "-"}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{formatDate(user.last_login_at)}</TableCell>
                <TableCell>{formatDate(user.created_at)}</TableCell>
                <TableCell>
                  {user.disabled_at ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : (
                    <Badge variant="default">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/admin/users/${user.id}`}>View</Link>
                  </Button>
                  <Button
                    variant={user.disabled_at ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDisableEnable(user)}
                  >
                    {user.disabled_at ? "Enable" : "Disable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({data?.total ?? 0} users)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
