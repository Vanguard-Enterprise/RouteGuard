"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Vehicle, VehicleUpsertPayload } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BusIcon, ChevronLeftIcon, ChevronRightIcon, FilterIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

type FormState = {
  vehicle_id: string
  license_plate: string
  capacity: string
  is_active: boolean
}

type VehicleFilters = {
  license_plate: string
  status: "all" | "active" | "inactive"
}

const emptyForm: FormState = {
  vehicle_id: "",
  license_plate: "",
  capacity: "",
  is_active: true,
}

const emptyFilters: VehicleFilters = {
  license_plate: "",
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

function toPayload(form: FormState): VehicleUpsertPayload {
  return {
    vehicle_id: form.vehicle_id.trim(),
    license_plate: form.license_plate.trim(),
    capacity: Number(form.capacity),
    is_active: form.is_active,
  }
}

export function VehicleManagementPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<VehicleFilters>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<VehicleFilters>(emptyFilters)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Vehicle | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [deletedPage, setDeletedPage] = useState(1)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)

  const key = useMemo(
    () => ["org-vehicles", debouncedQuery, page, perPage] as const,
    [debouncedQuery, page, perPage]
  )

  const { data, error, isLoading, mutate } = useSWR(key, () =>
    api.org.vehicles.list({
      search: debouncedQuery || undefined,
      page,
      per_page: perPage,
    })
  )

  const deletedKey = useMemo(
    () => (trashOpen ? (["org-vehicles-deleted", deletedPage] as const) : null),
    [trashOpen, deletedPage]
  )
  const {
    data: deletedData,
    error: deletedError,
    isLoading: deletedLoading,
    mutate: mutateDeleted,
  } = useSWR(deletedKey, () =>
    api.org.vehicles.listDeleted({
      page: deletedPage,
      per_page: 10,
    })
  )

  const vehicles = useMemo(() => {
    const items = data?.items ?? []
    const plate = filters.license_plate.trim().toLowerCase()

    return items.filter((vehicle) => {
      if (plate && !vehicle.license_plate.toLowerCase().includes(plate)) {
        return false
      }
      if (filters.status !== "all") {
        return filters.status === "active" ? vehicle.is_active : !vehicle.is_active
      }
      return true
    })
  }, [data?.items, filters.license_plate, filters.status])

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function openCreateModal() {
    resetForm()
    setModalOpen(true)
  }

  function openEditModal(vehicle: Vehicle) {
    setEditingId(vehicle.id)
    setForm({
      vehicle_id: vehicle.vehicle_id,
      license_plate: vehicle.license_plate,
      capacity: String(vehicle.capacity),
      is_active: vehicle.is_active,
    })
    setModalOpen(true)
  }

  async function handleSubmit() {
    const capacity = Number(form.capacity)
    if (!Number.isInteger(capacity) || capacity <= 0) {
      toast.error("Capacity must be a positive whole number")
      return
    }

    setSaving(true)
    try {
      const payload = toPayload(form)
      if (editingId) {
        await api.org.vehicles.update(editingId, payload)
        toast.success("Vehicle updated")
      } else {
        await api.org.vehicles.create(payload)
        toast.success("Vehicle created")
      }
      setModalOpen(false)
      resetForm()
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save vehicle"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveConfirmed() {
    if (!archiveTarget) {
      return
    }
    setArchiving(true)
    try {
      await api.org.vehicles.remove(archiveTarget.id)
      toast.success("Vehicle archived")
      if (editingId === archiveTarget.id) {
        setModalOpen(false)
        resetForm()
      }
      setArchiveTarget(null)
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive vehicle"
      toast.error(message)
    } finally {
      setArchiving(false)
    }
  }

  async function handleRecoverVehicle(vehicle: Vehicle) {
    setRecoveringId(vehicle.id)
    try {
      await api.org.vehicles.restore(vehicle.id)
      toast.success("Vehicle recovered")
      mutate()
      mutateDeleted()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to recover vehicle"
      toast.error(message)
    } finally {
      setRecoveringId(null)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

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

  const hasActiveFilters =
    Boolean(filters.license_plate.trim()) ||
    filters.status !== "all"

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Vehicle Management</h1>
        <p className="text-sm text-muted-foreground">
          Create, update, and archive vehicles for your organization.
        </p>
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vehicle-id">Vehicle ID</Label>
              <Input
                id="vehicle-id"
                value={form.vehicle_id}
                onChange={(e) => updateForm("vehicle_id", e.target.value)}
                placeholder="BUS-1001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license-plate">License Plate</Label>
              <Input
                id="license-plate"
                value={form.license_plate}
                onChange={(e) => updateForm("license_plate", e.target.value)}
                placeholder="ABC-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => updateForm("capacity", e.target.value)}
                placeholder="48"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active-status">Status</Label>
              <Select
                value={form.is_active ? "active" : "inactive"}
                onValueChange={(value) => updateForm("is_active", value === "active")}
              >
                <SelectTrigger id="active-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Vehicle" : "Create Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={filtersOpen}
        onOpenChange={(open) => {
          setFiltersOpen(open)
          if (open) {
            setDraftFilters(filters)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter Vehicles</DialogTitle>
            <DialogDescription>
              Filter by license plate or status.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="filter-plate">License Plate</Label>
              <Input
                id="filter-plate"
                value={draftFilters.license_plate}
                onChange={(e) => setDraftFilters((current) => ({ ...current, license_plate: e.target.value }))}
                placeholder="Plate number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-status">Status</Label>
              <Select
                value={draftFilters.status}
                onValueChange={(value: "all" | "active" | "inactive") =>
                  setDraftFilters((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger id="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
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
            <Input
              className="md:flex-1"
              placeholder="Search by vehicle ID or license plate"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
            <Button variant="outline" className="w-auto gap-2" onClick={() => setFiltersOpen(true)}>
              <FilterIcon className="size-4" />
              <span>{hasActiveFilters ? "Filters Applied" : "Filter"}</span>
            </Button>
            <Button size="sm" className="w-auto" onClick={openCreateModal}>
              Add Vehicle
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-12"
              onClick={() => {
                setDeletedPage(1)
                setTrashOpen(true)
              }}
              title="View archived vehicles"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load vehicles"}
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : vehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No vehicles found.
                    </TableCell>
                  </TableRow>
                ) : (
                  vehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div className="font-medium">{vehicle.vehicle_id}</div>
                        <div className="text-xs text-muted-foreground">ID: {vehicle.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>{vehicle.license_plate}</TableCell>
                      <TableCell>{vehicle.capacity}</TableCell>
                      <TableCell>
                        <Badge variant={vehicle.is_active ? "default" : "secondary"}>
                          {vehicle.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditModal(vehicle)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setArchiveTarget(vehicle)}>
                            Archive
                          </Button>
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
                  setPerPage(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[88px]">
                  <div className="flex items-center gap-2">
                    <BusIcon className="size-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
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

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive {archiveTarget?.vehicle_id}. You can no longer manage it in this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={archiving} onClick={handleArchiveConfirmed}>
              {archiving ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Archived Vehicles</DialogTitle>
            <DialogDescription>
              Soft-deleted vehicles can be recovered before permanent deletion.
            </DialogDescription>
          </DialogHeader>
          {deletedError ? (
            <p className="text-sm text-destructive">
              {deletedError instanceof Error ? deletedError.message : "Failed to load archived vehicles"}
            </p>
          ) : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>Archived At</TableHead>
                  <TableHead>Deletion In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading archived vehicles...
                    </TableCell>
                  </TableRow>
                ) : (deletedData?.items.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No archived vehicles.
                    </TableCell>
                  </TableRow>
                ) : (
                  deletedData?.items.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>{vehicle.vehicle_id}</TableCell>
                      <TableCell>{vehicle.license_plate}</TableCell>
                      <TableCell>
                        {vehicle.deleted_at ? new Date(vehicle.deleted_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell>{formatTimeUntilDeletion(vehicle.deleted_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => handleRecoverVehicle(vehicle)}
                          disabled={recoveringId === vehicle.id}
                        >
                          <RotateCcwIcon className="size-4" />
                          {recoveringId === vehicle.id ? "Recovering..." : "Recover"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {deletedData?.page ?? 1} of {Math.max(1, deletedData?.total_pages ?? 1)}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!deletedData || deletedData.page <= 1}
                onClick={() => setDeletedPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!deletedData || deletedData.page >= deletedData.total_pages}
                onClick={() => setDeletedPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
