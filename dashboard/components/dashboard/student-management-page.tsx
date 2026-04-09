"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Student, StudentFilterOptions, StudentUpsertPayload } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ComboboxMultiSelect } from "@/components/ui/combobox"
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
import { Slider } from "@/components/ui/slider"
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
  FilterIcon,
  LoaderCircleIcon,
  SquarePenIcon,
  Trash2Icon,
  UserRoundIcon,
  UserRoundPlusIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

type FormState = {
  student_id: string
  first_name: string
  last_name: string
  grade: string
  school: string
  guardian_name: string
  guardian_contact: string
  is_active: boolean
}

type StudentFilters = {
  gradeRange: [number, number] | null
  schools: string[]
}

const emptyForm: FormState = {
  student_id: "",
  first_name: "",
  last_name: "",
  grade: "",
  school: "",
  guardian_name: "",
  guardian_contact: "",
  is_active: true,
}

const emptyFilters: StudentFilters = {
  gradeRange: null,
  schools: [],
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

function toPayload(form: FormState): StudentUpsertPayload {
  return {
    student_id: form.student_id.trim(),
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    grade: form.grade.trim(),
    school: form.school.trim(),
    guardian_name: form.guardian_name.trim(),
    guardian_contact: form.guardian_contact.trim(),
    is_active: form.is_active,
  }
}

function normalizeGradeRange(
  range: [number, number] | null,
  options: StudentFilterOptions | undefined
): [number, number] | null {
  if (!range) {
    return null
  }

  const grades = options?.grades ?? []
  if (grades.length === 0) {
    return null
  }

  const minGrade = grades[0]
  const maxGrade = grades[grades.length - 1]
  return [Math.max(minGrade, range[0]), Math.min(maxGrade, range[1])]
}

function isFullGradeRange(
  range: [number, number] | null,
  bounds: [number, number] | null
) {
  if (!range || !bounds) {
    return false
  }

  return range[0] === bounds[0] && range[1] === bounds[1]
}

function formatGradeLabel(grade: number) {
  return grade === 0 ? "K" : String(grade)
}

function getAutoPerPage(viewportHeight: number) {
  const reservedVerticalSpacePx = 390
  const estimatedRowHeightPx = 54
  const estimatedVisibleRows = Math.floor((viewportHeight - reservedVerticalSpacePx) / estimatedRowHeightPx)

  return Math.max(10, Math.min(24, estimatedVisibleRows))
}

export function StudentManagementPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const userSetPerPageRef = useRef(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<StudentFilters>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<StudentFilters>(emptyFilters)
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatusSaving, setBulkStatusSaving] = useState(false)
  const [bulkArchiveTargetIds, setBulkArchiveTargetIds] = useState<string[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [deletedPage, setDeletedPage] = useState(1)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)

  const { data: filterOptions, error: filterOptionsError } = useSWR(
    ["org-student-filter-options"],
    () => api.org.students.filterOptions()
  )

  const studentListParams = useMemo(() => {
    const gradeRange = normalizeGradeRange(filters.gradeRange, filterOptions)
    return {
      search: debouncedQuery || undefined,
      grade_min: gradeRange?.[0],
      grade_max: gradeRange?.[1],
      schools: filters.schools.length > 0 ? filters.schools : undefined,
      page,
      per_page: perPage,
    }
  }, [debouncedQuery, filterOptions, filters.gradeRange, filters.schools, page, perPage])

  const key = useMemo(
    () =>
      [
        "org-students",
        studentListParams.search ?? "",
        studentListParams.grade_min ?? "",
        studentListParams.grade_max ?? "",
        (studentListParams.schools ?? []).join("|"),
        page,
        perPage,
      ] as const,
    [studentListParams, page, perPage]
  )

  const { data, error, isLoading, mutate } = useSWR(key, () => api.org.students.list(studentListParams))

  const deletedKey = useMemo(
    () => (trashOpen ? (["org-students-deleted", deletedPage] as const) : null),
    [trashOpen, deletedPage]
  )
  const {
    data: deletedData,
    error: deletedError,
    isLoading: deletedLoading,
    mutate: mutateDeleted,
  } = useSWR(deletedKey, () =>
    api.org.students.listDeleted({
      page: deletedPage,
      per_page: 10,
    })
  )

  const students = data?.items ?? []
  const availableGrades = useMemo(
    () => Array.from(new Set([0, ...(filterOptions?.grades ?? [])])).sort((a, b) => a - b),
    [filterOptions?.grades]
  )
  const gradeBounds = useMemo<[number, number] | null>(() => {
    if (availableGrades.length === 0) {
      return null
    }
    return [availableGrades[0], availableGrades[availableGrades.length - 1]]
  }, [availableGrades])
  const schoolOptions = useMemo(
    () => (filterOptions?.schools ?? []).map((school) => ({ label: school, value: school })),
    [filterOptions?.schools]
  )
  const visibleStudentIds = useMemo(() => students.map((student) => student.id), [students])
  const visibleSelectedCount = useMemo(
    () => visibleStudentIds.filter((id) => selectedIds.has(id)).length,
    [selectedIds, visibleStudentIds]
  )
  const allVisibleSelected = visibleStudentIds.length > 0 && visibleSelectedCount === visibleStudentIds.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected
  const normalizedDraftGradeRange = normalizeGradeRange(draftFilters.gradeRange, filterOptions)
  const sliderValue = gradeBounds
    ? normalizedDraftGradeRange ?? gradeBounds
    : [0, 0]
  const selectedCount = selectedIds.size
  const bulkActionPending = bulkStatusSaving || archiving

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function toggleStudentSelection(studentId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(studentId)
      } else {
        next.delete(studentId)
      }
      return next
    })
  }

  function setVisibleSelection(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const studentId of visibleStudentIds) {
        if (checked) {
          next.add(studentId)
        } else {
          next.delete(studentId)
        }
      }
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function removeSelection(studentIds: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of studentIds) {
        next.delete(id)
      }
      return next
    })
  }

  function openCreateModal() {
    resetForm()
    setModalOpen(true)
  }

  function openEditModal(student: Student) {
    setEditingId(student.id)
    setForm({
      student_id: student.student_id,
      first_name: student.first_name,
      last_name: student.last_name,
      grade: student.grade,
      school: student.school,
      guardian_name: student.guardian_name,
      guardian_contact: student.guardian_contact,
      is_active: student.is_active,
    })
    setModalOpen(true)
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      const payload = toPayload(form)
      if (editingId) {
        await api.org.students.update(editingId, payload)
        toast.success("Student updated")
      } else {
        await api.org.students.create(payload)
        toast.success("Student created")
      }
      setModalOpen(false)
      resetForm()
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save student"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveConfirmed() {
    const archiveIds = bulkArchiveTargetIds.length > 0
      ? bulkArchiveTargetIds
      : archiveTarget
        ? [archiveTarget.id]
        : []
    if (archiveIds.length === 0) {
      return
    }
    setArchiving(true)
    try {
      if (bulkArchiveTargetIds.length > 0) {
        const result = await api.org.students.bulkRemove(bulkArchiveTargetIds)
        removeSelection(result.student_ids)
        toast.success(
          result.processed_count === 1
            ? "Student archived"
            : `${result.processed_count} students archived`
        )
      } else if (archiveTarget) {
        await api.org.students.remove(archiveTarget.id)
        removeSelection([archiveTarget.id])
        toast.success("Student archived")
        if (editingId === archiveTarget.id) {
          setModalOpen(false)
          resetForm()
        }
      }
      setArchiveTarget(null)
      setBulkArchiveTargetIds([])
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive student"
      toast.error(message)
    } finally {
      setArchiving(false)
    }
  }

  async function handleBulkStatusUpdate(isActive: boolean) {
    const studentIds = Array.from(selectedIds)
    if (studentIds.length === 0) {
      return
    }

    setBulkStatusSaving(true)
    try {
      const result = await api.org.students.bulkUpdateStatus(studentIds, isActive)
      removeSelection(result.student_ids)
      toast.success(
        result.processed_count === 1
          ? `Student marked ${isActive ? "active" : "inactive"}`
          : `${result.processed_count} students marked ${isActive ? "active" : "inactive"}`
      )
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update students"
      toast.error(message)
    } finally {
      setBulkStatusSaving(false)
    }
  }

  async function handleRecoverStudent(student: Student) {
    setRecoveringId(student.id)
    try {
      await api.org.students.restore(student.id)
      toast.success("Student recovered")
      mutate()
      mutateDeleted()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to recover student"
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
    const updatePerPageForViewport = () => {
      if (userSetPerPageRef.current) return
      const clampedRows = getAutoPerPage(window.innerHeight)
      setPerPage((current) => (current === clampedRows ? current : clampedRows))
    }

    updatePerPageForViewport()
    window.addEventListener("resize", updatePerPageForViewport)
    return () => window.removeEventListener("resize", updatePerPageForViewport)
  }, [])

  function applyFilters() {
    const normalizedGradeRange = normalizeGradeRange(draftFilters.gradeRange, filterOptions)
    setFilters({
      gradeRange: isFullGradeRange(normalizedGradeRange, gradeBounds) ? null : normalizedGradeRange,
      schools: draftFilters.schools,
    })
    setFiltersOpen(false)
    setPage(1)
  }

  function clearFilters() {
    setDraftFilters(emptyFilters)
    setFilters(emptyFilters)
    setPage(1)
  }

  const hasActiveFilters =
    filters.gradeRange !== null ||
    filters.schools.length > 0

  const perPageOptions = useMemo(() => {
    const base = [10, 25, 50]
    const options = userSetPerPageRef.current ? [...base, perPage] : base
    return Array.from(new Set(options)).sort((a, b) => a - b)
  }, [perPage])

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Student Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage core student roster records for your organization.
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
            <DialogTitle>{editingId ? "Edit Student" : "Add Student"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="student-id">Student ID</Label>
              <Input
                id="student-id"
                value={form.student_id}
                onChange={(e) => updateForm("student_id", e.target.value)}
                placeholder="STD-1001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">Grade</Label>
              <Input
                id="grade"
                value={form.grade}
                onChange={(e) => updateForm("grade", e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={form.first_name}
                onChange={(e) => updateForm("first_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={form.last_name}
                onChange={(e) => updateForm("last_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school">School</Label>
              <Input
                id="school"
                value={form.school}
                onChange={(e) => updateForm("school", e.target.value)}
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
            <div className="space-y-2">
              <Label htmlFor="guardian-name">Guardian Name</Label>
              <Input
                id="guardian-name"
                value={form.guardian_name}
                onChange={(e) => updateForm("guardian_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardian-contact">Guardian Contact</Label>
              <Input
                id="guardian-contact"
                value={form.guardian_contact}
                onChange={(e) => updateForm("guardian_contact", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Student" : "Create Student"}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filter Students</DialogTitle>
            <DialogDescription>
              Filter by active grade range and school.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Grade Range</Label>
                {gradeBounds ? (
                  <span className="text-sm text-muted-foreground">
                    {formatGradeLabel(sliderValue[0])} to {formatGradeLabel(sliderValue[1])}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">No active numeric grades</span>
                )}
              </div>
              {gradeBounds ? (
                <Slider
                  value={sliderValue}
                  min={gradeBounds[0]}
                  max={gradeBounds[1]}
                  step={1}
                  minStepsBetweenThumbs={0}
                  disabled={availableGrades.length <= 1}
                  onValueChange={(value) => {
                    if (value.length < 2) return
                    setDraftFilters((current) => ({
                      ...current,
                      gradeRange: [value[0] ?? gradeBounds[0], value[1] ?? gradeBounds[1]],
                    }))
                  }}
                />
              ) : null}
              {availableGrades.length > 0 ? (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${availableGrades.length}, minmax(0, 1fr))` }}
                >
                  {availableGrades.map((grade) => (
                    (() => {
                      const isSingleGradeSelected = sliderValue[0] === grade && sliderValue[1] === grade

                      return (
                        <Button
                          key={grade}
                          type="button"
                          variant={isSingleGradeSelected ? "default" : "outline"}
                          size="sm"
                          className="w-full"
                          aria-pressed={isSingleGradeSelected}
                          onClick={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              gradeRange: isSingleGradeSelected ? null : [grade, grade],
                            }))
                          }
                        >
                          {formatGradeLabel(grade)}
                        </Button>
                      )
                    })()
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>School</Label>
              <ComboboxMultiSelect
                options={schoolOptions}
                value={draftFilters.schools}
                onValueChange={(schools) => setDraftFilters((current) => ({ ...current, schools }))}
                placeholder="Select schools"
                searchPlaceholder="Search schools"
                emptyMessage="No schools found."
              />
            </div>

            {filterOptionsError ? (
              <p className="text-sm text-destructive">
                {filterOptionsError instanceof Error
                  ? filterOptionsError.message
                  : "Failed to load filter options"}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={applyFilters}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              className="md:flex-1"
              placeholder="Search by ID, name, school, or guardian"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              onClick={() => setFiltersOpen(true)}
              aria-label={hasActiveFilters ? "Filters applied" : "Filter students"}
              title={hasActiveFilters ? "Filters applied" : "Filter students"}
            >
              <FilterIcon />
              {hasActiveFilters ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="absolute -top-1 -right-1 inline-flex size-4 items-center justify-center rounded-full border bg-background hover:bg-muted"
                  onClick={(event) => {
                    event.stopPropagation()
                    clearFilters()
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    event.stopPropagation()
                    clearFilters()
                  }}
                  title="Remove filters"
                  aria-label="Remove filters"
                >
                  <XIcon className="size-3" />
                </span>
              ) : null}
            </Button>
            <Button
              size="icon"
              className="size-9"
              onClick={openCreateModal}
              aria-label="Add student"
              title="Add student"
            >
              <UserRoundPlusIcon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              onClick={() => {
                setDeletedPage(1)
                setTrashOpen(true)
              }}
              title="View archived students"
              aria-label="View archived students"
            >
              <Trash2Icon />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selectedCount > 0 ? (
            <div className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedCount} selected</Badge>
                <span className="text-sm text-muted-foreground">
                  Selection persists across pages and filters until cleared.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkStatusUpdate(true)}
                  disabled={bulkActionPending}
                >
                  {bulkStatusSaving ? <LoaderCircleIcon className="animate-spin" /> : null}
                  Set Active
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkStatusUpdate(false)}
                  disabled={bulkActionPending}
                >
                  {bulkStatusSaving ? <LoaderCircleIcon className="animate-spin" /> : null}
                  Set Inactive
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setBulkArchiveTargetIds(Array.from(selectedIds))}
                  disabled={bulkActionPending}
                >
                  {archiving ? <LoaderCircleIcon className="animate-spin" /> : null}
                  Archive
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  disabled={bulkActionPending}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          ) : null}
          {error && (
            <p className="mb-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load students"}
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      aria-label={allVisibleSelected ? "Clear visible students" : "Select visible students"}
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => setVisibleSelection(checked === true)}
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow key={student.id} data-state={selectedIds.has(student.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${student.first_name} ${student.last_name}`}
                          checked={selectedIds.has(student.id)}
                          onCheckedChange={(checked) => toggleStudentSelection(student.id, checked === true)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{student.student_id}</div>
                      </TableCell>
                      <TableCell>{student.grade}</TableCell>
                      <TableCell>{student.school}</TableCell>
                      <TableCell>
                        <div>{student.guardian_name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{student.guardian_contact || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={student.is_active ? "default" : "secondary"}>
                          {student.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => openEditModal(student)}
                            aria-label={`Edit ${student.first_name} ${student.last_name}`}
                            title="Edit"
                          >
                            <SquarePenIcon className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => setArchiveTarget(student)}
                            aria-label={`Archive ${student.first_name} ${student.last_name}`}
                            title="Archive"
                          >
                            <ArchiveIcon className="size-4" />
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
                value={userSetPerPageRef.current ? String(perPage) : "auto"}
                onValueChange={(value) => {
                  if (value === "auto") {
                    userSetPerPageRef.current = false
                    setPerPage(getAutoPerPage(window.innerHeight))
                    setPage(1)
                    return
                  }

                  userSetPerPageRef.current = true
                  setPerPage(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger className="min-w-[76px]">
                  <div className="flex items-center gap-2">
                    <UserRoundIcon className="size-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
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

      <AlertDialog
        open={Boolean(archiveTarget) || bulkArchiveTargetIds.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null)
            setBulkArchiveTargetIds([])
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkArchiveTargetIds.length > 0 ? "Archive Selected Students?" : "Archive Student?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkArchiveTargetIds.length > 0
                ? `This will archive ${bulkArchiveTargetIds.length} selected students. They will no longer appear in this list.`
                : `This will archive ${archiveTarget?.first_name} ${archiveTarget?.last_name}. You can no longer manage this student in this list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={archiving} onClick={handleArchiveConfirmed}>
              {archiving
                ? "Archiving..."
                : bulkArchiveTargetIds.length > 0
                  ? `Archive ${bulkArchiveTargetIds.length} Students`
                  : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Archived Students</DialogTitle>
            <DialogDescription>
              Soft-deleted students can be recovered before permanent deletion.
            </DialogDescription>
          </DialogHeader>
          {deletedError ? (
            <p className="text-sm text-destructive">
              {deletedError instanceof Error ? deletedError.message : "Failed to load archived students"}
            </p>
          ) : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Archived At</TableHead>
                  <TableHead>Deletion In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading archived students...
                    </TableCell>
                  </TableRow>
                ) : (deletedData?.items.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No archived students.
                    </TableCell>
                  </TableRow>
                ) : (
                  deletedData?.items.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="font-medium">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{student.student_id}</div>
                      </TableCell>
                      <TableCell>{student.school}</TableCell>
                      <TableCell>
                        {student.deleted_at ? new Date(student.deleted_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell>{formatTimeUntilDeletion(student.deleted_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => handleRecoverStudent(student)}
                          disabled={recoveringId === student.id}
                        >
                          {recoveringId === student.id ? "Recovering..." : "Recover"}
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
