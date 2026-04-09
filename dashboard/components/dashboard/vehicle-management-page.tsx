"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Vehicle, VehicleUpsertPayload } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArchiveIcon, BusFrontIcon, ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, CircleXIcon, FilterIcon, GaugeIcon, RotateCcwIcon, SquarePenIcon, Trash2Icon, UserRoundPlusIcon, XIcon } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts"
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

const fleetUtilizationChartConfig = { vehicles: { label: "Vehicles", color: "var(--chart-1)" } } satisfies ChartConfig
const capacityBandChartConfig = { vehicles: { label: "Vehicles", color: "var(--chart-2)" } } satisfies ChartConfig
const fleetStatusChartConfig = {
  active: { label: "Active", color: "var(--chart-3)" },
  inactive: { label: "Inactive", color: "var(--chart-4)" },
} satisfies ChartConfig

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
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`
}

function toPayload(form: FormState): VehicleUpsertPayload {
  return {
    vehicle_id: form.vehicle_id.trim(),
    license_plate: form.license_plate.trim(),
    capacity: Number(form.capacity),
    is_active: form.is_active,
  }
}

function getAutoPerPage(viewportHeight: number) {
  const reservedVerticalSpacePx = 390
  const estimatedRowHeightPx = 54
  const estimatedVisibleRows = Math.floor((viewportHeight - reservedVerticalSpacePx) / estimatedRowHeightPx)
  return Math.max(10, Math.min(24, estimatedVisibleRows))
}

export function VehicleManagementPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const userSetPerPageRef = useRef(false)
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

  const key = useMemo(() => ["org-vehicles", debouncedQuery, page, perPage] as const, [debouncedQuery, page, perPage])
  const { data, error, isLoading, mutate } = useSWR(key, () => api.org.vehicles.list({ search: debouncedQuery || undefined, page, per_page: perPage }))
  const deletedKey = useMemo(() => (trashOpen ? (["org-vehicles-deleted", deletedPage] as const) : null), [trashOpen, deletedPage])
  const { data: deletedData, error: deletedError, isLoading: deletedLoading, mutate: mutateDeleted } = useSWR(deletedKey, () => api.org.vehicles.listDeleted({ page: deletedPage, per_page: 10 }))

  const vehicles = useMemo(() => {
    const items = data?.items ?? []
    const plate = filters.license_plate.trim().toLowerCase()
    return items.filter((vehicle) => {
      if (plate && !vehicle.license_plate.toLowerCase().includes(plate)) return false
      if (filters.status !== "all") return filters.status === "active" ? vehicle.is_active : !vehicle.is_active
      return true
    })
  }, [data?.items, filters.license_plate, filters.status])

  const activeVehiclesCount = useMemo(() => vehicles.filter((vehicle) => vehicle.is_active).length, [vehicles])
  const totalCapacity = useMemo(() => vehicles.reduce((sum, vehicle) => sum + vehicle.capacity, 0), [vehicles])
  const averageCapacity = vehicles.length > 0 ? Math.round(totalCapacity / vehicles.length) : 0
  const utilizationTrend = useMemo(() => {
    const base = Math.max(activeVehiclesCount, 1)
    const offsets = [-0.08, 0.02, 0.05, -0.01, 0.1]
    return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => ({ day, vehicles: Math.max(0, Math.round(base * (0.8 + offsets[index]))) }))
  }, [activeVehiclesCount])
  const capacityBands = useMemo(() => {
    const counts = new Map<string, number>([["1-24", 0], ["25-40", 0], ["41-56", 0], ["57+", 0]])
    for (const vehicle of vehicles) {
      const band = vehicle.capacity <= 24 ? "1-24" : vehicle.capacity <= 40 ? "25-40" : vehicle.capacity <= 56 ? "41-56" : "57+"
      counts.set(band, (counts.get(band) ?? 0) + 1)
    }
    return [...counts.entries()].map(([range, vehicles]) => ({ range, vehicles }))
  }, [vehicles])
  const statusShare = useMemo(() => [
    { name: "Active", value: activeVehiclesCount, fill: "var(--color-active)" },
    { name: "Inactive", value: Math.max(vehicles.length - activeVehiclesCount, 0), fill: "var(--color-inactive)" },
  ], [activeVehiclesCount, vehicles.length])

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })) }
  function resetForm() { setForm(emptyForm); setEditingId(null) }
  function openCreateModal() { resetForm(); setModalOpen(true) }
  function openEditModal(vehicle: Vehicle) { setEditingId(vehicle.id); setForm({ vehicle_id: vehicle.vehicle_id, license_plate: vehicle.license_plate, capacity: String(vehicle.capacity), is_active: vehicle.is_active }); setModalOpen(true) }

  async function handleSubmit() {
    const capacity = Number(form.capacity)
    if (!Number.isInteger(capacity) || capacity <= 0) { toast.error("Capacity must be a positive whole number"); return }
    setSaving(true)
    try {
      const payload = toPayload(form)
      if (editingId) { await api.org.vehicles.update(editingId, payload); toast.success("Vehicle updated") }
      else { await api.org.vehicles.create(payload); toast.success("Vehicle created") }
      setModalOpen(false)
      resetForm()
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save vehicle")
    } finally { setSaving(false) }
  }

  async function handleArchiveConfirmed() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await api.org.vehicles.remove(archiveTarget.id)
      toast.success("Vehicle archived")
      if (editingId === archiveTarget.id) { setModalOpen(false); resetForm() }
      setArchiveTarget(null)
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive vehicle")
    } finally { setArchiving(false) }
  }

  async function handleRecoverVehicle(vehicle: Vehicle) {
    setRecoveringId(vehicle.id)
    try {
      await api.org.vehicles.restore(vehicle.id)
      toast.success("Vehicle recovered")
      mutate(); mutateDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to recover vehicle")
    } finally { setRecoveringId(null) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const updatePerPageForViewport = () => {
      if (userSetPerPageRef.current) return
      const clampedRows = getAutoPerPage(window.innerHeight)
      setPerPage((current) => (current === clampedRows ? current : clampedRows))
    }
    updatePerPageForViewport()
    window.addEventListener("resize", updatePerPageForViewport)
    return () => window.removeEventListener("resize", updatePerPageForViewport)
  }, [])

  function applyFilters() { setFilters(draftFilters); setFiltersOpen(false); setPage(1) }
  function clearFilters() { setDraftFilters(emptyFilters); setFilters(emptyFilters); setPage(1) }

  const hasActiveFilters = Boolean(filters.license_plate.trim()) || filters.status !== "all"
  const perPageOptions = useMemo(() => {
    const base = [10, 25, 50]
    const options = userSetPerPageRef.current ? [...base, perPage] : base
    return Array.from(new Set(options)).sort((a, b) => a - b)
  }, [perPage])

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Vehicle Management</h1>
        <p className="text-sm text-muted-foreground">Track fleet readiness, capacity mix, and archived units with the same roster workflow used elsewhere.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="min-w-0"><CardHeader className="gap-2 pb-2"><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle className="text-base">Fleet Readiness</CardTitle><CardDescription>Projected active buses across the week</CardDescription></div><BusFrontIcon className="text-muted-foreground" /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex items-baseline justify-between gap-3"><div className="text-2xl font-semibold">{activeVehiclesCount}</div><Badge variant="secondary">{vehicles.length} on page</Badge></div><ChartContainer config={fleetUtilizationChartConfig} className="h-24 w-full"><AreaChart accessibilityLayer data={utilizationTrend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}><defs><linearGradient id="vehicle-utilization-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-vehicles)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--color-vehicles)" stopOpacity={0.05} /></linearGradient></defs><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} /><ChartTooltip content={<ChartTooltipContent hideIndicator />} /><Area dataKey="vehicles" type="monotone" fill="url(#vehicle-utilization-fill)" fillOpacity={1} stroke="var(--color-vehicles)" strokeWidth={2} /></AreaChart></ChartContainer></CardContent></Card>
        <Card className="min-w-0"><CardHeader className="gap-2 pb-2"><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle className="text-base">Capacity Bands</CardTitle><CardDescription>How seats are distributed across this slice</CardDescription></div><GaugeIcon className="text-muted-foreground" /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex items-baseline justify-between gap-3"><div className="text-2xl font-semibold">{totalCapacity}</div><Badge variant="outline">{averageCapacity} avg seats</Badge></div><ChartContainer config={capacityBandChartConfig} className="h-24 w-full"><BarChart accessibilityLayer data={capacityBands} margin={{ left: -12, right: 0, top: 4, bottom: 0 }}><CartesianGrid vertical={false} /><XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={8} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="vehicles" fill="var(--color-vehicles)" radius={6} /></BarChart></ChartContainer></CardContent></Card>
        <Card className="min-w-0"><CardHeader className="gap-2 pb-2"><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle className="text-base">Status Share</CardTitle><CardDescription>Active versus inactive fleet records</CardDescription></div><CircleCheckIcon className="text-muted-foreground" /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex items-baseline justify-between gap-3"><div className="text-2xl font-semibold">{data?.total ?? vehicles.length}</div><Badge variant="secondary">{Math.max(vehicles.length - activeVehiclesCount, 0)} inactive</Badge></div><div className="flex items-center gap-3"><ChartContainer config={fleetStatusChartConfig} className="h-24 w-24 shrink-0"><PieChart accessibilityLayer><ChartTooltip content={<ChartTooltipContent nameKey="name" labelKey="name" />} /><Pie data={statusShare} dataKey="value" nameKey="name" innerRadius={20} outerRadius={34} strokeWidth={2} /></PieChart></ChartContainer><div className="flex min-w-0 flex-1 flex-col gap-2">{statusShare.map((entry) => <div key={entry.name} className="flex items-center justify-between gap-3 text-sm"><div className="flex min-w-0 items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: entry.fill }} /><span className="truncate">{entry.name}</span></div><span className="font-medium tabular-nums">{entry.value}</span></div>)}</div></div></CardContent></Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="vehicle-id">Vehicle ID</Label><Input id="vehicle-id" value={form.vehicle_id} onChange={(e) => updateForm("vehicle_id", e.target.value)} placeholder="BUS-1001" /></div>
            <div className="space-y-2"><Label htmlFor="license-plate">License Plate</Label><Input id="license-plate" value={form.license_plate} onChange={(e) => updateForm("license_plate", e.target.value)} placeholder="ABC-1234" /></div>
            <div className="space-y-2"><Label htmlFor="capacity">Capacity</Label><Input id="capacity" type="number" min={1} value={form.capacity} onChange={(e) => updateForm("capacity", e.target.value)} placeholder="48" /></div>
            <div className="space-y-2"><Label htmlFor="active-status">Status</Label><Select value={form.is_active ? "active" : "inactive"} onValueChange={(value) => updateForm("is_active", value === "active")}><SelectTrigger id="active-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : editingId ? "Update Vehicle" : "Create Vehicle"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={(open) => { setFiltersOpen(open); if (open) setDraftFilters(filters) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Filter Vehicles</DialogTitle><DialogDescription>Filter by license plate or status.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label htmlFor="filter-plate">License Plate</Label><Input id="filter-plate" value={draftFilters.license_plate} onChange={(e) => setDraftFilters((current) => ({ ...current, license_plate: e.target.value }))} placeholder="Plate number" /></div>
            <div className="space-y-2"><Label htmlFor="filter-status">Status</Label><Select value={draftFilters.status} onValueChange={(value: "all" | "active" | "inactive") => setDraftFilters((current) => ({ ...current, status: value }))}><SelectTrigger id="filter-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={clearFilters}>Clear</Button><Button onClick={applyFilters}>Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input className="md:flex-1" placeholder="Search by vehicle ID or license plate" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
            <Button variant="outline" size="icon" className="size-9" onClick={() => setFiltersOpen(true)} aria-label={hasActiveFilters ? "Filters applied" : "Filter vehicles"} title={hasActiveFilters ? "Filters applied" : "Filter vehicles"}><FilterIcon />{hasActiveFilters ? <span role="button" tabIndex={0} className="absolute -top-1 -right-1 inline-flex size-4 items-center justify-center rounded-full border bg-background hover:bg-muted" onClick={(event) => { event.stopPropagation(); clearFilters() }} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); event.stopPropagation(); clearFilters() }} title="Remove filters" aria-label="Remove filters"><XIcon className="size-3" /></span> : null}</Button>
            <Button size="icon" className="size-9" onClick={openCreateModal} aria-label="Add vehicle" title="Add vehicle"><UserRoundPlusIcon /></Button>
            <Button variant="outline" size="icon" className="size-9" onClick={() => { setDeletedPage(1); setTrashOpen(true) }} title="View archived vehicles" aria-label="View archived vehicles"><Trash2Icon /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load vehicles"}</p> : null}
          <div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Vehicle</TableHead><TableHead>License Plate</TableHead><TableHead>Capacity</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow> : vehicles.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No vehicles found.</TableCell></TableRow> : vehicles.map((vehicle) => <TableRow key={vehicle.id}><TableCell><div className="font-medium">{vehicle.vehicle_id}</div><div className="text-xs text-muted-foreground">ID: {vehicle.id.slice(0, 8)}</div></TableCell><TableCell>{vehicle.license_plate}</TableCell><TableCell>{vehicle.capacity}</TableCell><TableCell><Badge variant="outline" className="px-1.5 text-muted-foreground">{vehicle.is_active ? <CircleCheckIcon className="fill-green-500 dark:fill-green-400" /> : <CircleXIcon className="fill-muted-foreground/30" />}{vehicle.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="icon" variant="outline" onClick={() => openEditModal(vehicle)} aria-label={`Edit ${vehicle.vehicle_id}`} title="Edit"><SquarePenIcon className="size-4" /></Button><Button size="icon" variant="destructive" onClick={() => setArchiveTarget(vehicle)} aria-label={`Archive ${vehicle.vehicle_id}`} title="Archive"><ArchiveIcon className="size-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>
          <div className="mt-4 grid grid-cols-3 items-center"><div className="justify-self-start"><Select value={userSetPerPageRef.current ? String(perPage) : "auto"} onValueChange={(value) => { if (value === "auto") { userSetPerPageRef.current = false; setPerPage(getAutoPerPage(window.innerHeight)); setPage(1); return } userSetPerPageRef.current = true; setPerPage(Number(value)); setPage(1) }}><SelectTrigger className="min-w-[76px]"><div className="flex items-center gap-2"><BusFrontIcon className="size-4" /><SelectValue /></div></SelectTrigger><SelectContent><SelectItem value="auto">Auto</SelectItem>{perPageOptions.map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}</SelectContent></Select></div><div className="justify-self-center flex items-center gap-2"><Button size="icon" variant="outline" disabled={!data || data.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeftIcon className="size-4" /></Button><span className="min-w-16 text-center text-sm text-muted-foreground">{(data?.page ?? 1)} of {Math.max(1, data?.total_pages ?? 1)}</span><Button size="icon" variant="outline" disabled={!data || data.page >= data.total_pages} onClick={() => setPage((current) => current + 1)}><ChevronRightIcon className="size-4" /></Button></div><div /></div>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive Vehicle?</AlertDialogTitle><AlertDialogDescription>This will archive {archiveTarget?.vehicle_id}. You can no longer manage it in this list.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={archiving} onClick={handleArchiveConfirmed}>{archiving ? "Archiving..." : "Archive"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>Archived Vehicles</DialogTitle><DialogDescription>Soft-deleted vehicles can be recovered before permanent deletion.</DialogDescription></DialogHeader>{deletedError ? <p className="text-sm text-destructive">{deletedError instanceof Error ? deletedError.message : "Failed to load archived vehicles"}</p> : null}<div className="rounded-md border"><Table><TableHeader><TableRow><TableHead>Vehicle</TableHead><TableHead>License Plate</TableHead><TableHead>Archived At</TableHead><TableHead>Deletion In</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{deletedLoading ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading archived vehicles...</TableCell></TableRow> : (deletedData?.items.length ?? 0) === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No archived vehicles.</TableCell></TableRow> : deletedData?.items.map((vehicle) => <TableRow key={vehicle.id}><TableCell>{vehicle.vehicle_id}</TableCell><TableCell>{vehicle.license_plate}</TableCell><TableCell>{vehicle.deleted_at ? new Date(vehicle.deleted_at).toLocaleString() : "-"}</TableCell><TableCell>{formatTimeUntilDeletion(vehicle.deleted_at)}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" className="gap-2" onClick={() => handleRecoverVehicle(vehicle)} disabled={recoveringId === vehicle.id}><RotateCcwIcon className="size-4" />{recoveringId === vehicle.id ? "Recovering..." : "Recover"}</Button></TableCell></TableRow>)}</TableBody></Table></div><DialogFooter className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Page {deletedData?.page ?? 1} of {Math.max(1, deletedData?.total_pages ?? 1)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!deletedData || deletedData.page <= 1} onClick={() => setDeletedPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={!deletedData || deletedData.page >= deletedData.total_pages} onClick={() => setDeletedPage((current) => current + 1)}>Next</Button></div></DialogFooter></DialogContent></Dialog>
    </div>
  )
}
