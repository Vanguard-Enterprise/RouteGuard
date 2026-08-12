"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Driver, DriverUpsertPayload } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MiniAreaChart, MiniBarChart, MiniDonutChart } from "@/components/ui/mini-charts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FilterIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PhoneIcon,
  RotateCcwIcon,
  SquarePenIcon,
  Trash2Icon,
  UserRoundIcon,
  UserRoundPlusIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

type DriverFilters = {
  status: "all" | "active" | "inactive" | "available" | "unavailable"
}

const emptyPayload: DriverUpsertPayload = {
  driver_id: "",
  name: "",
  phone: "",
  is_available: true,
  is_active: true,
}

const emptyFilters: DriverFilters = {
  status: "all",
}

const SOFT_DELETE_RETENTION_DAYS = 30

function formatTimeUntilDeletion(deletedAt?: string | null) {
  if (!deletedAt) return "Unknown"
  const deleted = new Date(deletedAt)
  if (Number.isNaN(deleted.getTime())) return "Unknown"

  const deadline = new Date(deleted.getTime() + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const msRemaining = deadline.getTime() - Date.now()
  if (msRemaining <= 0) return "Due now"

  const totalHours = Math.floor(msRemaining / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  return `${hours}h`
}

function getAutoPerPage(viewportHeight: number) {
  const reservedVerticalSpacePx = 390
  const estimatedRowHeightPx = 54
  const estimatedVisibleRows = Math.floor((viewportHeight - reservedVerticalSpacePx) / estimatedRowHeightPx)

  return Math.max(10, Math.min(24, estimatedVisibleRows))
}

function formatPinUpdatedAt(pinUpdatedAt?: string | null) {
  if (!pinUpdatedAt) return "Not set"
  const parsed = new Date(pinUpdatedAt)
  if (Number.isNaN(parsed.getTime())) return "Not set"
  return parsed.toLocaleString()
}

type DriverManagementPageProps = {
  canWrite: boolean
}

export function DriverManagementPage({ canWrite }: DriverManagementPageProps) {
  const [payload, setPayload] = useState<DriverUpsertPayload>(emptyPayload)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [autoPerPage, setAutoPerPage] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<DriverFilters>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<DriverFilters>(emptyFilters)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Driver | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [availabilityTarget, setAvailabilityTarget] = useState<Driver | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [deletedPage, setDeletedPage] = useState(1)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<Driver | null>(null)
  const [pinValue, setPinValue] = useState("")
  const [pinSaving, setPinSaving] = useState(false)
  const [pinClearing, setPinClearing] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  const key = useMemo(
    () => ["org-drivers", debouncedQuery, filters.status, page, perPage] as const,
    [debouncedQuery, filters.status, page, perPage]
  )

  const { data, isLoading, error, mutate } = useSWR(key, () =>
    api.org.drivers.list({
      search: debouncedQuery || undefined,
      status: filters.status,
      page,
      per_page: perPage,
    })
  )

  const deletedKey = useMemo(
    () => (trashOpen ? (["org-drivers-deleted", deletedPage] as const) : null),
    [trashOpen, deletedPage]
  )
  const {
    data: deletedData,
    error: deletedError,
    isLoading: deletedLoading,
    mutate: mutateDeleted,
  } = useSWR(deletedKey, () =>
    api.org.drivers.listDeleted({
      page: deletedPage,
      per_page: 10,
    })
  )

  const drivers = useMemo(() => data?.items ?? [], [data?.items])
  const activeDriversCount = useMemo(() => drivers.filter((driver) => driver.is_active).length, [drivers])
  const availableDriversCount = useMemo(() => drivers.filter((driver) => driver.is_available).length, [drivers])
  const phoneCoverageCount = useMemo(() => drivers.filter((driver) => driver.phone.trim().length > 0).length, [drivers])
  const coveragePercent = drivers.length > 0 ? Math.round((phoneCoverageCount / drivers.length) * 100) : 0
  const availabilityTrend = useMemo(() => {
    const base = Math.max(availableDriversCount, 1)
    const offsets = [-0.06, 0.04, -0.02, 0.07, 0.11]
    return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => ({
      day,
      drivers: Math.max(0, Math.round(base * (0.82 + offsets[index]))),
    }))
  }, [availableDriversCount])
  const statusDistribution = useMemo(
    () => [
      { name: "Active", drivers: activeDriversCount },
      { name: "Inactive", drivers: Math.max(drivers.length - activeDriversCount, 0) },
      { name: "Available", drivers: availableDriversCount },
    ],
    [activeDriversCount, availableDriversCount, drivers.length]
  )
  const coverageData = useMemo(
    () => [
      { name: "With Phone", value: phoneCoverageCount, fill: "var(--color-covered)" },
      { name: "Missing Phone", value: Math.max(drivers.length - phoneCoverageCount, 0), fill: "var(--color-missing)" },
    ],
    [drivers.length, phoneCoverageCount]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const updatePerPageForViewport = () => {
      if (!autoPerPage) return
      const clampedRows = getAutoPerPage(window.innerHeight)
      setPerPage((current) => (current === clampedRows ? current : clampedRows))
    }

    updatePerPageForViewport()
    window.addEventListener("resize", updatePerPageForViewport)
    return () => window.removeEventListener("resize", updatePerPageForViewport)
  }, [autoPerPage])

  function resetForm() {
    setPayload(emptyPayload)
    setEditingId(null)
  }

  function openCreateModal() {
    resetForm()
    setModalOpen(true)
  }

  function openEditModal(driver: Driver) {
    setEditingId(driver.id)
    setPayload({
      driver_id: driver.driver_id,
      name: driver.name,
      phone: driver.phone,
      is_available: driver.is_available,
      is_active: driver.is_active,
    })
    setModalOpen(true)
  }

  function openPinModal(driver: Driver) {
    setPinTarget(driver)
    setPinValue("")
    setPinError(null)
  }

  async function handleSubmit() {
    if (!payload.driver_id?.trim() || !payload.name?.trim()) {
      toast.error("Driver ID and name are required")
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await api.org.drivers.update(editingId, payload)
        toast.success("Driver updated")
      } else {
        await api.org.drivers.create(payload)
        toast.success("Driver created")
      }
      setModalOpen(false)
      resetForm()
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save driver")
    } finally {
      setSaving(false)
    }
  }

  async function handleAvailabilityToggle() {
    if (!availabilityTarget) return
    setAvailabilitySaving(true)
    try {
      await api.org.drivers.update(availabilityTarget.id, {
        driver_id: availabilityTarget.driver_id,
        name: availabilityTarget.name,
        phone: availabilityTarget.phone,
        is_available: !availabilityTarget.is_available,
        is_active: availabilityTarget.is_active,
      })
      toast.success("Driver availability updated")
      setAvailabilityTarget(null)
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update driver")
    } finally {
      setAvailabilitySaving(false)
    }
  }

  async function handleArchiveConfirmed() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await api.org.drivers.remove(archiveTarget.id)
      toast.success("Driver archived")
      if (editingId === archiveTarget.id) {
        setModalOpen(false)
        resetForm()
      }
      setArchiveTarget(null)
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive driver")
    } finally {
      setArchiving(false)
    }
  }

  async function handleRecoverDriver(driver: Driver) {
    setRecoveringId(driver.id)
    try {
      await api.org.drivers.restore(driver.id)
      toast.success("Driver recovered")
      mutate()
      mutateDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to recover driver")
    } finally {
      setRecoveringId(null)
    }
  }

  async function handleSetPin() {
    if (!pinTarget) return

    const normalizedPin = pinValue.replace(/\D/g, "").slice(0, 4)
    if (normalizedPin.length !== 4 || normalizedPin !== pinValue) {
      setPinError("PIN must be exactly 4 digits")
      return
    }

    setPinSaving(true)
    setPinError(null)
    try {
      await api.org.drivers.setPin(pinTarget.id, normalizedPin)
      toast.success(pinTarget.has_pin ? "Driver PIN updated" : "Driver PIN set")
      setPinTarget(null)
      setPinValue("")
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save driver PIN"
      setPinError(message)
      toast.error(message)
    } finally {
      setPinSaving(false)
    }
  }

  async function handleClearPin() {
    if (!pinTarget) return

    setPinClearing(true)
    setPinError(null)
    try {
      await api.org.drivers.clearPin(pinTarget.id)
      toast.success("Driver PIN cleared")
      setPinTarget(null)
      setPinValue("")
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear driver PIN"
      setPinError(message)
      toast.error(message)
    } finally {
      setPinClearing(false)
    }
  }

  function applyFilters() {
    setFilters(draftFilters)
    setFiltersOpen(false)
    setPage(1)
  }

  function clearFilters() {
    setDraftFilters(emptyFilters)
    setFilters(emptyFilters)
    setPage(1)
  }

  const hasActiveFilters = filters.status !== "all"
  const perPageOptions = useMemo(() => {
    const base = [10, 25, 50]
    const options = autoPerPage ? base : [...base, perPage]
    return Array.from(new Set(options)).sort((a, b) => a - b)
  }, [autoPerPage, perPage])

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Driver Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage your driver roster, phone readiness, device PIN access, and PM availability from one workspace.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Availability Trend</CardTitle>
                <CardDescription>Projected available drivers across the week</CardDescription>
              </div>
              <UserRoundIcon className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">{availableDriversCount}</div>
              <Badge variant="secondary">{activeDriversCount} active</Badge>
            </div>
            <MiniAreaChart
              data={availabilityTrend.map((item) => ({ label: item.day, value: item.drivers }))}
              label="Available drivers by day"
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Roster Mix</CardTitle>
                <CardDescription>Status split across this page</CardDescription>
              </div>
              <CircleCheckIcon className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">{data?.total ?? drivers.length}</div>
              <Badge variant="outline">{Math.max(drivers.length - activeDriversCount, 0)} inactive</Badge>
            </div>
            <MiniBarChart
              data={statusDistribution.map((item) => ({ label: item.name, value: item.drivers }))}
              color="var(--chart-2)"
              label="Driver roster by status"
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Contact Coverage</CardTitle>
                <CardDescription>Phone capture and dispatch readiness</CardDescription>
              </div>
              <PhoneIcon className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">{coveragePercent}%</div>
              <Badge variant="secondary">{phoneCoverageCount} with phones</Badge>
            </div>
            <div className="flex items-center gap-3">
              <MiniDonutChart
                data={coverageData.map((item) => ({ label: item.name, value: item.value, color: item.fill }))}
                label="Driver phone coverage"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {coverageData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: entry.fill }} />
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <span className="font-medium tabular-nums">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Driver" : "Add Driver"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="driver-id">Driver ID</Label>
              <Input id="driver-id" value={payload.driver_id} onChange={(e) => setPayload((current) => ({ ...current, driver_id: e.target.value }))} placeholder="DRV-1001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-name">Name</Label>
              <Input id="driver-name" value={payload.name} onChange={(e) => setPayload((current) => ({ ...current, name: e.target.value }))} placeholder="Alex Carter" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-phone">Phone</Label>
              <Input id="driver-phone" value={payload.phone ?? ""} onChange={(e) => setPayload((current) => ({ ...current, phone: e.target.value }))} placeholder="(555) 555-0114" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-availability">Availability</Label>
              <Select value={payload.is_available ? "available" : "unavailable"} onValueChange={(value) => setPayload((current) => ({ ...current, is_available: value === "available" }))}>
                <SelectTrigger id="driver-availability"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-status">Status</Label>
              <Select value={payload.is_active ? "active" : "inactive"} onValueChange={(value) => setPayload((current) => ({ ...current, is_active: value === "active" }))}>
                <SelectTrigger id="driver-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : editingId ? "Update Driver" : "Create Driver"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pinTarget)}
        onOpenChange={(open) => {
          if (open) return
          if (pinSaving || pinClearing) return
          setPinTarget(null)
          setPinValue("")
          setPinError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pinTarget?.has_pin ? "Update Driver PIN" : "Set Driver PIN"}</DialogTitle>
            <DialogDescription>
              Enter a write-only 4-digit PIN for {pinTarget?.name}. This PIN is used on the RouteGuard bus device login pad.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Current state</span>
                <Badge variant={pinTarget?.has_pin ? "secondary" : "outline"}>
                  {pinTarget?.has_pin ? "PIN set" : "No PIN"}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                Last updated: {formatPinUpdatedAt(pinTarget?.pin_updated_at)}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-pin">4-digit PIN</Label>
              <Input
                id="driver-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234"
                value={pinValue}
                onChange={(event) => {
                  setPinError(null)
                  setPinValue(event.target.value.replace(/\D/g, "").slice(0, 4))
                }}
              />
            </div>
            {pinError ? <p className="text-sm text-destructive">{pinError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {pinTarget?.has_pin ? (
                <Button
                  variant="outline"
                  onClick={handleClearPin}
                  disabled={pinSaving || pinClearing}
                >
                  {pinClearing ? "Clearing..." : "Clear PIN"}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPinTarget(null)
                  setPinValue("")
                  setPinError(null)
                }}
                disabled={pinSaving || pinClearing}
              >
                Cancel
              </Button>
              <Button onClick={handleSetPin} disabled={pinSaving || pinClearing}>
                {pinSaving ? "Saving..." : pinTarget?.has_pin ? "Update PIN" : "Set PIN"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={(open) => { setFiltersOpen(open); if (open) setDraftFilters(filters) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter Drivers</DialogTitle>
            <DialogDescription>Narrow the roster by availability or active status.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="filter-driver-status">Status</Label>
              <Select value={draftFilters.status} onValueChange={(value: DriverFilters["status"]) => setDraftFilters((current) => ({ ...current, status: value }))}>
                <SelectTrigger id="filter-driver-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>Clear</Button>
            <Button onClick={applyFilters}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input className="md:flex-1" placeholder="Search by driver ID, name, or phone" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
            <Button variant="outline" size="icon" className="size-9" onClick={() => setFiltersOpen(true)} aria-label={hasActiveFilters ? "Filters applied" : "Filter drivers"} title={hasActiveFilters ? "Filters applied" : "Filter drivers"}>
              <FilterIcon />
              {hasActiveFilters ? (
                <span role="button" tabIndex={0} className="absolute -top-1 -right-1 inline-flex size-4 items-center justify-center rounded-full border bg-background hover:bg-muted" onClick={(event) => { event.stopPropagation(); clearFilters() }} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); event.stopPropagation(); clearFilters() }} title="Remove filters" aria-label="Remove filters">
                  <XIcon className="size-3" />
                </span>
              ) : null}
            </Button>
            {canWrite ? (
              <Button size="icon" className="size-9" onClick={openCreateModal} aria-label="Add driver" title="Add driver"><UserRoundPlusIcon /></Button>
            ) : null}
            <Button variant="outline" size="icon" className="size-9" onClick={() => { setDeletedPage(1); setTrashOpen(true) }} title="View archived drivers" aria-label="View archived drivers"><Trash2Icon /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load drivers"}</p> : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Device PIN</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                ) : drivers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No drivers found.</TableCell></TableRow>
                ) : (
                  drivers.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell><div className="font-medium">{driver.name}</div><div className="text-xs text-muted-foreground">{driver.driver_id}</div></TableCell>
                      <TableCell>{driver.phone || "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={driver.has_pin ? "secondary" : "outline"} className="w-fit">
                            {driver.has_pin ? "PIN set" : "No PIN"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatPinUpdatedAt(driver.pin_updated_at)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="px-1.5 text-muted-foreground">
                          {driver.is_available ? <CircleCheckIcon className="fill-green-500 dark:fill-green-400" /> : <CircleXIcon className="fill-muted-foreground/30" />}
                          {driver.is_available ? "Available" : "Unavailable"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="px-1.5 text-muted-foreground">
                          {driver.is_active ? <CircleCheckIcon className="fill-green-500 dark:fill-green-400" /> : <CircleXIcon className="fill-muted-foreground/30" />}
                          {driver.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canWrite ? (
                            <>
                              <Button size="icon" variant="outline" onClick={() => openPinModal(driver)} aria-label={`Manage PIN for ${driver.name}`} title={driver.has_pin ? "Update PIN" : "Set PIN"}>
                                <KeyRoundIcon className="size-4" />
                              </Button>
                              <Button size="icon" variant="outline" onClick={() => setAvailabilityTarget(driver)} aria-label={`Toggle availability for ${driver.name}`} title={driver.is_available ? "Mark unavailable" : "Mark available"}>
                                {availabilitySaving && availabilityTarget?.id === driver.id ? <LoaderCircleIcon className="size-4 animate-spin" /> : <UserRoundIcon className="size-4" />}
                              </Button>
                              <Button size="icon" variant="outline" onClick={() => openEditModal(driver)} aria-label={`Edit ${driver.name}`} title="Edit"><SquarePenIcon className="size-4" /></Button>
                              <Button size="icon" variant="destructive" onClick={() => setArchiveTarget(driver)} aria-label={`Archive ${driver.name}`} title="Archive"><ArchiveIcon className="size-4" /></Button>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground">Read only</span>
                          )}
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
              <Select value={autoPerPage ? "auto" : String(perPage)} onValueChange={(value) => { if (value === "auto") { setAutoPerPage(true); setPerPage(getAutoPerPage(window.innerHeight)); setPage(1); return } setAutoPerPage(false); setPerPage(Number(value)); setPage(1) }}>
                <SelectTrigger className="min-w-[76px]"><div className="flex items-center gap-2"><UserRoundIcon className="size-4" /><SelectValue /></div></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {perPageOptions.map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="justify-self-center flex items-center gap-2">
              <Button size="icon" variant="outline" disabled={!data || data.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeftIcon className="size-4" /></Button>
              <span className="min-w-16 text-center text-sm text-muted-foreground">{(data?.page ?? 1)} of {Math.max(1, data?.total_pages ?? 1)}</span>
              <Button size="icon" variant="outline" disabled={!data || data.page >= data.total_pages} onClick={() => setPage((current) => current + 1)}><ChevronRightIcon className="size-4" /></Button>
            </div>
            <div />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Driver?</AlertDialogTitle>
            <AlertDialogDescription>This will archive {archiveTarget?.name}. You can recover this driver later from archived records.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={archiving || !canWrite} onClick={handleArchiveConfirmed}>{archiving ? "Archiving..." : "Archive"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(availabilityTarget)} onOpenChange={(open) => !open && setAvailabilityTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{availabilityTarget?.is_available ? "Mark Driver Unavailable?" : "Mark Driver Available?"}</AlertDialogTitle>
            <AlertDialogDescription>{availabilityTarget?.name} will be updated for dispatch availability without changing active roster status.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={availabilitySaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={availabilitySaving || !canWrite} onClick={handleAvailabilityToggle}>{availabilitySaving ? "Saving..." : availabilityTarget?.is_available ? "Mark Unavailable" : "Mark Available"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Archived Drivers</DialogTitle>
            <DialogDescription>Soft-deleted drivers can be recovered before permanent deletion.</DialogDescription>
          </DialogHeader>
          {deletedError ? <p className="text-sm text-destructive">{deletedError instanceof Error ? deletedError.message : "Failed to load archived drivers"}</p> : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Archived At</TableHead>
                  <TableHead>Deletion In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading archived drivers...</TableCell></TableRow>
                ) : (deletedData?.items.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No archived drivers.</TableCell></TableRow>
                ) : (
                  deletedData?.items.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell><div className="font-medium">{driver.name}</div><div className="text-xs text-muted-foreground">{driver.driver_id}</div></TableCell>
                      <TableCell>{driver.phone || "-"}</TableCell>
                      <TableCell>{driver.deleted_at ? new Date(driver.deleted_at).toLocaleString() : "-"}</TableCell>
                      <TableCell>{formatTimeUntilDeletion(driver.deleted_at)}</TableCell>
                      <TableCell className="text-right">
                        {canWrite ? (
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => handleRecoverDriver(driver)} disabled={recoveringId === driver.id}><RotateCcwIcon className="size-4" />{recoveringId === driver.id ? "Recovering..." : "Recover"}</Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">Read only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Page {deletedData?.page ?? 1} of {Math.max(1, deletedData?.total_pages ?? 1)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!deletedData || deletedData.page <= 1} onClick={() => setDeletedPage((current) => Math.max(1, current - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={!deletedData || deletedData.page >= deletedData.total_pages} onClick={() => setDeletedPage((current) => current + 1)}>Next</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
