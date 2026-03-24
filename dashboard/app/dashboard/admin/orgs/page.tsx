"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { Organization, PageResponse } from "@/lib/api"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CreateOrganizationDialog } from "@/components/dashboard/create-organization-dialog"
import { toast } from "sonner"
import useSWR from "swr"

const PER_PAGE = 25

export default function OrgsPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, error, isLoading, mutate } = useSWR<PageResponse<Organization>>(
    ["platform-orgs", debouncedSearch, page],
    () =>
      api.platform.orgs.list({
        search: debouncedSearch || undefined,
        page,
        per_page: PER_PAGE,
      })
  )

  const handleSuspend = useCallback(
    async (org: Organization) => {
      try {
        await api.platform.orgs.suspend(org.id)
        toast.success(`${org.name} suspended`)
        mutate()
      } catch {
        toast.error("Failed to suspend organization")
      }
    },
    [mutate]
  )

  const handleReactivate = useCallback(
    async (org: Organization) => {
      try {
        await api.platform.orgs.reactivate(org.id)
        toast.success(`${org.name} reactivated`)
        mutate()
      } catch {
        toast.error("Failed to reactivate organization")
      }
    },
    [mutate]
  )

  const orgs = data?.items ?? []
  const totalPages = data?.total_pages ?? 1

  const openOrg = useCallback(
    (orgId: string) => {
      router.push(`/dashboard/admin/orgs/${orgId}`)
    },
    [router]
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <CreateOrganizationDialog onCreated={() => mutate()} />
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">Failed to load organizations.</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : orgs.length === 0 ? (
              <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No organizations found.
                  </TableCell>
              </TableRow>
            ) : (
              orgs.map((org) => (
                <TableRow
                  key={org.id}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  onClick={() => openOrg(org.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      openOrg(org.id)
                    }
                  }}
                >
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                  <TableCell>
                    {org.suspended_at ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(org.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {org.suspended_at ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReactivate(org)
                        }}
                      >
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSuspend(org)
                        }}
                      >
                        Suspend
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} organization${data.total !== 1 ? "s" : ""} total` : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="flex items-center px-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
