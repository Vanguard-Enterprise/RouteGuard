"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { DriverUpsertPayload } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeftIcon, ChevronRightIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"

const emptyPayload: DriverUpsertPayload = {
  driver_id: "",
  name: "",
  phone: "",
  is_available: true,
  is_active: true,
}

export function DriverManagementPage() {
  const [payload, setPayload] = useState<DriverUpsertPayload>(emptyPayload)
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "available" | "unavailable">("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const userSetPerPageRef = useRef(false)

  const { data, isLoading, error, mutate } = useSWR(["drivers", debouncedSearch, statusFilter, page, perPage], () =>
    api.org.drivers.list({ search: debouncedSearch || undefined, status: statusFilter, page, per_page: perPage })
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const updatePerPageForViewport = () => {
      if (userSetPerPageRef.current) return
      const viewportHeight = window.innerHeight
      const reservedVerticalSpacePx = 470
      const estimatedRowHeightPx = 54
      const estimatedVisibleRows = Math.floor((viewportHeight - reservedVerticalSpacePx) / estimatedRowHeightPx)
      const clampedRows = Math.max(10, Math.min(24, estimatedVisibleRows))
      setPerPage((current) => (current === clampedRows ? current : clampedRows))
    }

    updatePerPageForViewport()
    window.addEventListener("resize", updatePerPageForViewport)
    return () => window.removeEventListener("resize", updatePerPageForViewport)
  }, [])

  const perPageOptions = useMemo(() => {
    const base = [10, 25, 50]
    return Array.from(new Set([...base, perPage])).sort((a, b) => a - b)
  }, [perPage])

  async function createDriver() {
    if (!payload.driver_id?.trim() || !payload.name?.trim()) {
      toast.error("Driver ID and name are required")
      return
    }
    try {
      await api.org.drivers.create(payload)
      setPayload(emptyPayload)
      setPage(1)
      mutate()
      toast.success("Driver created")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create driver")
    }
  }

  async function toggleAvailability(id: string, currentAvailable: boolean, currentActive: boolean, driver_id: string, name: string, phone: string) {
    try {
      await api.org.drivers.update(id, {
        driver_id,
        name,
        phone,
        is_available: !currentAvailable,
        is_active: currentActive,
      })
      mutate()
      toast.success("Driver updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update driver")
    }
  }

  async function archiveDriver(id: string) {
    try {
      await api.org.drivers.remove(id)
      mutate()
      toast.success("Driver archived")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive driver")
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Driver Management</h1>
        <p className="text-sm text-muted-foreground">Manage driver roster and PM availability.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Driver</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <Input
            placeholder="Driver ID"
            value={payload.driver_id}
            onChange={(e) => setPayload((p) => ({ ...p, driver_id: e.target.value }))}
          />
          <Input
            placeholder="Name"
            value={payload.name}
            onChange={(e) => setPayload((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            placeholder="Phone"
            value={payload.phone}
            onChange={(e) => setPayload((p) => ({ ...p, phone: e.target.value }))}
          />
          <Select
            value={payload.is_available ? "available" : "unavailable"}
            onValueChange={(v) => setPayload((p) => ({ ...p, is_available: v === "available" }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={createDriver}>Create Driver</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="Search drivers"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          <Select
            value={statusFilter}
            onValueChange={(v: typeof statusFilter) => {
              setStatusFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="md:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load drivers"}</p> : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                ) : (data?.items.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No drivers found.</TableCell></TableRow>
                ) : (
                  data?.items.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell>
                        <div className="font-medium">{driver.name}</div>
                        <div className="text-xs text-muted-foreground">{driver.driver_id}</div>
                      </TableCell>
                      <TableCell>{driver.phone || "-"}</TableCell>
                      <TableCell>{driver.is_available ? "Yes" : "No"}</TableCell>
                      <TableCell>{driver.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAvailability(driver.id, driver.is_available, driver.is_active, driver.driver_id, driver.name, driver.phone)}
                          >
                            {driver.is_available ? "Mark Unavailable" : "Mark Available"}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => archiveDriver(driver.id)}>Archive</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 grid grid-cols-3 items-center">
            <div className="justify-self-start">
              <Select
                value={String(perPage)}
                onValueChange={(value) => {
                  userSetPerPageRef.current = true
                  setPerPage(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[88px]">
                  <div className="flex items-center gap-2">
                    <UserRoundIcon className="size-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {perPageOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="justify-self-center flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                disabled={!data || data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="min-w-16 text-center text-sm text-muted-foreground">
                {(data?.page ?? 1)} of {Math.max(1, data?.total_pages ?? 1)}
              </span>
              <Button
                size="icon"
                variant="outline"
                disabled={!data || data.page >= data.total_pages}
                onClick={() => setPage((current) => current + 1)}
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
            <div />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
