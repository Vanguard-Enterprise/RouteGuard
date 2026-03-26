"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { School, SchoolUpsertPayload } from "@/lib/api"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, Building2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

type FormState = {
  name: string
  address: string
  contact_phone: string
  is_active: boolean
}

type SchoolFilters = {
  name: string
  address: string
}

type AddressSuggestion = {
  label: string
  address: string
  source: "local" | "google" | "nominatim"
  place_id?: string
}

const emptyForm: FormState = {
  name: "",
  address: "",
  contact_phone: "",
  is_active: true,
}

const emptyFilters: SchoolFilters = {
  name: "",
  address: "",
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

function toPayload(form: FormState): SchoolUpsertPayload {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    contact_phone: form.contact_phone.trim(),
    is_active: form.is_active,
  }
}

function uniqueSuggestions(...groups: AddressSuggestion[][]): AddressSuggestion[] {
  const seen = new Set<string>()
  const result: AddressSuggestion[] = []
  for (const item of groups.flat()) {
    const key = item.address.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

export function SchoolManagementPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<SchoolFilters>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<SchoolFilters>(emptyFilters)
  const [saving, setSaving] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [addressSearchLoading, setAddressSearchLoading] = useState(false)
  const [placeDetailsLoading, setPlaceDetailsLoading] = useState(false)
  const [addressFocused, setAddressFocused] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [deletedPage, setDeletedPage] = useState(1)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)
  const addressCacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map())

  const key = useMemo(
    () => ["org-schools", debouncedQuery, page, perPage] as const,
    [debouncedQuery, page, perPage]
  )

  const { data, error, isLoading, mutate } = useSWR(key, () =>
    api.org.schools.list({
      search: debouncedQuery || undefined,
      page,
      per_page: perPage,
    })
  )
  const deletedKey = useMemo(
    () => (trashOpen ? (["org-schools-deleted", deletedPage] as const) : null),
    [trashOpen, deletedPage]
  )
  const {
    data: deletedData,
    error: deletedError,
    isLoading: deletedLoading,
    mutate: mutateDeleted,
  } = useSWR(deletedKey, () =>
    api.org.schools.listDeleted({
      page: deletedPage,
      per_page: 10,
    })
  )

  const schools = useMemo(() => {
    const items = data?.items ?? []
    const name = filters.name.trim().toLowerCase()
    const address = filters.address.trim().toLowerCase()

    return items.filter((school) => {
      if (name && !school.name.toLowerCase().includes(name)) {
        return false
      }
      if (address && !school.address.toLowerCase().includes(address)) {
        return false
      }
      return true
    })
  }, [data?.items, filters.address, filters.name])
  const knownAddresses = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.items ?? [])
            .map((school) => school.address.trim())
            .filter((address) => address.length > 0)
        )
      ),
    [data?.items]
  )

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
    setAddressSuggestions([])
  }

  const applyInstantAddressSuggestions = useCallback((value: string) => {
    const needle = value.trim().toLowerCase()
    if (needle.length === 0) {
      setAddressSuggestions([])
      return
    }
    const localMatches: AddressSuggestion[] = knownAddresses
      .filter((address) => address.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((address) => ({
        label: address,
        address,
        source: "local",
      }))
    setAddressSuggestions(localMatches)
  }, [knownAddresses])

  async function applyGooglePlaceDetails(placeId: string) {
    setPlaceDetailsLoading(true)
    try {
      const response = await fetch(`/api/geo/place-details?place_id=${encodeURIComponent(placeId)}`)
      if (!response.ok) return
      const payload = (await response.json()) as { name?: string; address?: string; phone?: string }
      setForm((current) => ({
        ...current,
        name: payload.name?.trim() || current.name,
        address: payload.address?.trim() || current.address,
        contact_phone: payload.phone?.trim() || current.contact_phone,
      }))
    } finally {
      setPlaceDetailsLoading(false)
    }
  }

  async function applyGooglePlaceDetailsFromQuery(query: string) {
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 3) return

    setPlaceDetailsLoading(true)
    try {
      const response = await fetch(`/api/geo/place-details?q=${encodeURIComponent(normalizedQuery)}`)
      if (!response.ok) return
      const payload = (await response.json()) as { name?: string; address?: string; phone?: string }
      setForm((current) => ({
        ...current,
        name: payload.name?.trim() || current.name,
        address: payload.address?.trim() || current.address,
        contact_phone: payload.phone?.trim() || current.contact_phone,
      }))
    } finally {
      setPlaceDetailsLoading(false)
    }
  }

  function openCreateModal() {
    resetForm()
    setModalOpen(true)
  }

  function openEditModal(school: School) {
    setEditingId(school.id)
    setForm({
      name: school.name,
      address: school.address,
      contact_phone: school.contact_phone,
      is_active: school.is_active,
    })
    setModalOpen(true)
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      const payload = toPayload(form)
      if (editingId) {
        await api.org.schools.update(editingId, payload)
        toast.success("School updated")
      } else {
        await api.org.schools.create(payload)
        toast.success("School created")
      }
      setModalOpen(false)
      resetForm()
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save school"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(school: School) {
    if (!window.confirm(`Archive ${school.name}?`)) {
      return
    }
    try {
      await api.org.schools.remove(school.id)
      toast.success("School archived")
      if (editingId === school.id) {
        setModalOpen(false)
        resetForm()
      }
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive school"
      toast.error(message)
    }
  }

  async function handleRecoverSchool(school: School) {
    setRecoveringId(school.id)
    try {
      await api.org.schools.restore(school.id)
      toast.success("School recovered")
      mutate()
      mutateDeleted()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to recover school"
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

  useEffect(() => {
    if (!modalOpen) {
      setAddressSuggestions([])
      setAddressSearchLoading(false)
      return
    }

    const searchText = form.address.trim()
    if (searchText.length < 3) {
      applyInstantAddressSuggestions(searchText)
      setAddressSearchLoading(false)
      return
    }

    const cacheKey = searchText.toLowerCase()
    const cached = addressCacheRef.current.get(cacheKey)
    if (cached) {
      setAddressSuggestions((current) => uniqueSuggestions(current, cached).slice(0, 8))
      setAddressSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setAddressSearchLoading(true)
      try {
        const response = await fetch(
          `/api/geo/address-search?q=${encodeURIComponent(searchText)}`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error("Address search failed")
        }

        const payload = (await response.json()) as { items?: AddressSuggestion[] }
        const remoteSuggestions = payload.items ?? []
        addressCacheRef.current.set(cacheKey, remoteSuggestions)
        setAddressSuggestions((current) =>
          uniqueSuggestions(current, remoteSuggestions).slice(0, 8)
        )
      } catch {
        // Keep instant local suggestions even if remote lookup fails.
      } finally {
        setAddressSearchLoading(false)
      }
    }, 120)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [applyInstantAddressSuggestions, form.address, modalOpen])

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
    Boolean(filters.name.trim()) ||
    Boolean(filters.address.trim())

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">School Management</h1>
        <p className="text-sm text-muted-foreground">
          Create, update, and archive school records for your organization.
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
            <DialogTitle>{editingId ? "Edit School" : "Add School"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="school-name">Name</Label>
              <Input
                id="school-name"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                placeholder="North Elementary"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="school-address">Address</Label>
              <div className="relative">
                <Input
                  id="school-address"
                  value={form.address}
                  onFocus={() => setAddressFocused(true)}
                  onBlur={() => {
                    setTimeout(() => setAddressFocused(false), 120)
                    if (form.address.trim()) {
                      void applyGooglePlaceDetailsFromQuery(form.address)
                    }
                  }}
                  onChange={(e) => {
                    updateForm("address", e.target.value)
                    applyInstantAddressSuggestions(e.target.value)
                  }}
                  placeholder="Search and select an address"
                  autoComplete="off"
                />
                {addressFocused && addressSuggestions.length > 0 ? (
                  <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background shadow-sm">
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.source}:${suggestion.place_id ?? suggestion.address}`}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          updateForm("address", suggestion.address)
                          setAddressSuggestions([])
                          setAddressFocused(false)
                          if (suggestion.source === "google" && suggestion.place_id) {
                            void applyGooglePlaceDetails(suggestion.place_id)
                          } else {
                            void applyGooglePlaceDetailsFromQuery(suggestion.address)
                          }
                        }}
                      >
                        <div className="font-medium">{suggestion.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {suggestion.source === "google" ? "Google" : suggestion.source === "local" ? "Local" : "Address"}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {addressSearchLoading ? (
                <p className="text-xs text-muted-foreground">Searching addresses...</p>
              ) : null}
              {placeDetailsLoading ? (
                <p className="text-xs text-muted-foreground">Fetching location details...</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Contact Phone</Label>
              <Input
                id="contact-phone"
                value={form.contact_phone}
                onChange={(e) => updateForm("contact_phone", e.target.value)}
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
              {saving ? "Saving..." : editingId ? "Update School" : "Create School"}
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
            <DialogTitle>Filter Schools</DialogTitle>
            <DialogDescription>
              Filter by school name or address.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="filter-name">School Name</Label>
              <Input
                id="filter-name"
                value={draftFilters.name}
                onChange={(e) => setDraftFilters((current) => ({ ...current, name: e.target.value }))}
                placeholder="School name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-address">Address</Label>
              <Input
                id="filter-address"
                value={draftFilters.address}
                onChange={(e) => setDraftFilters((current) => ({ ...current, address: e.target.value }))}
                placeholder="Address"
              />
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
              placeholder="Search by ID, name, address, or phone"
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
              Add School
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-12"
              onClick={() => {
                setDeletedPage(1)
                setTrashOpen(true)
              }}
              title="View archived schools"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load schools"}
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
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
                ) : schools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No schools found.
                    </TableCell>
                  </TableRow>
                ) : (
                  schools.map((school) => (
                    <TableRow key={school.id}>
                      <TableCell>
                        <div className="font-medium">{school.name}</div>
                        <div className="text-xs text-muted-foreground">{school.school_id}</div>
                      </TableCell>
                      <TableCell>{school.address}</TableCell>
                      <TableCell>{school.contact_phone || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={school.is_active ? "default" : "secondary"}>
                          {school.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditModal(school)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleArchive(school)}>
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
                    <Building2Icon className="size-4" />
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

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Archived Schools</DialogTitle>
            <DialogDescription>
              Soft-deleted schools can be recovered before permanent deletion.
            </DialogDescription>
          </DialogHeader>
          {deletedError ? (
            <p className="text-sm text-destructive">
              {deletedError instanceof Error ? deletedError.message : "Failed to load archived schools"}
            </p>
          ) : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Archived At</TableHead>
                  <TableHead>Deletion In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading archived schools...
                    </TableCell>
                  </TableRow>
                ) : (deletedData?.items.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No archived schools.
                    </TableCell>
                  </TableRow>
                ) : (
                  deletedData?.items.map((school) => (
                    <TableRow key={school.id}>
                      <TableCell>
                        <div className="font-medium">{school.name}</div>
                        <div className="text-xs text-muted-foreground">{school.school_id}</div>
                      </TableCell>
                      <TableCell>{school.address}</TableCell>
                      <TableCell>
                        {school.deleted_at ? new Date(school.deleted_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell>{formatTimeUntilDeletion(school.deleted_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => handleRecoverSchool(school)}
                          disabled={recoveringId === school.id}
                        >
                          <RotateCcwIcon className="size-4" />
                          {recoveringId === school.id ? "Recovering..." : "Recover"}
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
