"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Student, StudentUpsertPayload } from "@/lib/api"
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
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, RotateCcwIcon, Trash2Icon, UserRoundIcon } from "lucide-react"
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
  grade: string
  school: string
  guardian: string
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
  grade: "",
  school: "",
  guardian: "",
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
  const [trashOpen, setTrashOpen] = useState(false)
  const [deletedPage, setDeletedPage] = useState(1)
  const [recoveringId, setRecoveringId] = useState<string | null>(null)

  const key = useMemo(
    () => ["org-students", debouncedQuery, page, perPage] as const,
    [debouncedQuery, page, perPage]
  )

  const { data, error, isLoading, mutate } = useSWR(key, () =>
    api.org.students.list({
      search: debouncedQuery || undefined,
      page,
      per_page: perPage,
    })
  )

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

  const students = useMemo(() => {
    const items = data?.items ?? []
    const grade = filters.grade.trim().toLowerCase()
    const school = filters.school.trim().toLowerCase()
    const guardian = filters.guardian.trim().toLowerCase()

    return items.filter((student) => {
      if (grade && !student.grade.toLowerCase().includes(grade)) {
        return false
      }
      if (school && !student.school.toLowerCase().includes(school)) {
        return false
      }
      if (guardian && !student.guardian_name.toLowerCase().includes(guardian)) {
        return false
      }
      return true
    })
  }, [data?.items, filters.grade, filters.guardian, filters.school])

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
    if (!archiveTarget) {
      return
    }
    setArchiving(true)
    try {
      await api.org.students.remove(archiveTarget.id)
      toast.success("Student archived")
      if (editingId === archiveTarget.id) {
        setModalOpen(false)
        resetForm()
      }
      setArchiveTarget(null)
      mutate()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive student"
      toast.error(message)
    } finally {
      setArchiving(false)
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
      const viewportHeight = window.innerHeight
      // Header, page title, filter/search controls, pagination/footer, and card padding.
      const reservedVerticalSpacePx = 390
      const estimatedRowHeightPx = 54
      const estimatedVisibleRows = Math.floor((viewportHeight - reservedVerticalSpacePx) / estimatedRowHeightPx)
      const clampedRows = Math.max(10, Math.min(24, estimatedVisibleRows))
      setPerPage((current) => (current === clampedRows ? current : clampedRows))
    }

    updatePerPageForViewport()
    window.addEventListener("resize", updatePerPageForViewport)
    return () => window.removeEventListener("resize", updatePerPageForViewport)
  }, [])

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
    Boolean(filters.grade.trim()) ||
    Boolean(filters.school.trim()) ||
    Boolean(filters.guardian.trim())

  const perPageOptions = useMemo(() => {
    const base = [10, 25, 50]
    return Array.from(new Set([...base, perPage])).sort((a, b) => a - b)
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter Students</DialogTitle>
            <DialogDescription>
              Filter by grade, school, or guardian.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="filter-grade">Grade</Label>
              <Input
                id="filter-grade"
                value={draftFilters.grade}
                onChange={(e) => setDraftFilters((current) => ({ ...current, grade: e.target.value }))}
                placeholder="e.g. 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-school">School</Label>
              <Input
                id="filter-school"
                value={draftFilters.school}
                onChange={(e) => setDraftFilters((current) => ({ ...current, school: e.target.value }))}
                placeholder="School name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-guardian">Guardian</Label>
              <Input
                id="filter-guardian"
                value={draftFilters.guardian}
                onChange={(e) => setDraftFilters((current) => ({ ...current, guardian: e.target.value }))}
                placeholder="Guardian name"
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
              placeholder="Search by ID, name, or school"
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
              Add Student
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-12"
              onClick={() => {
                setDeletedPage(1)
                setTrashOpen(true)
              }}
              title="View archived students"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load students"}
            </p>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No students found.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow key={student.id}>
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
                          <Button size="sm" variant="outline" onClick={() => openEditModal(student)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setArchiveTarget(student)}>
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

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Student?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive {archiveTarget?.first_name} {archiveTarget?.last_name}. You can no longer manage this student in this list.
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
                          <RotateCcwIcon className="size-4" />
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
