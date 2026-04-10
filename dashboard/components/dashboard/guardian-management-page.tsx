"use client"

import { useEffect, useState, useMemo } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { Student } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ComboboxMultiSelect } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FilterIcon,
  LoaderCircleIcon,
  PhoneIcon,
  SchoolIcon,
  UserRoundIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
} from "recharts"

type GuardianRecord = {
  id: string
  name: string
  contact: string
  students: Student[]
  studentCount: number
  activeStudentCount: number
  schools: string[]
  status: "active" | "inactive"
}

type FamilySizeFilter = "all" | "1" | "2" | "3+"

type GuardianFilters = {
  status: "all" | "active" | "inactive"
  schools: string[]
  familySize: FamilySizeFilter
}

const emptyFilters: GuardianFilters = {
  status: "all",
  schools: [],
  familySize: "all",
}

const guardianCoverageChartConfig = {
  families: {
    label: "Families",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const familySizeChartConfig = {
  guardians: {
    label: "Guardians",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const schoolShareChartConfig = {
  value: {
    label: "Guardians",
    color: "var(--chart-3)",
  },
  north: {
    label: "North",
    color: "var(--chart-1)",
  },
  south: {
    label: "South",
    color: "var(--chart-2)",
  },
  east: {
    label: "East",
    color: "var(--chart-3)",
  },
  west: {
    label: "West",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

function getAutoPerPage(viewportHeight: number) {
  const reservedVerticalSpacePx = 390
  const estimatedRowHeightPx = 54
  const estimatedVisibleRows = Math.floor((viewportHeight - reservedVerticalSpacePx) / estimatedRowHeightPx)

  return Math.max(10, Math.min(24, estimatedVisibleRows))
}

function normalizeGuardianValue(value: string) {
  return value.trim()
}

function buildGuardianId(name: string, contact: string) {
  return `${name.toLowerCase()}|${contact.toLowerCase()}`
}

async function listAllStudents() {
  const firstPage = await api.org.students.list({ page: 1, per_page: 200 })
  const items = [...firstPage.items]

  for (let page = 2; page <= firstPage.total_pages; page += 1) {
    const nextPage = await api.org.students.list({ page, per_page: 200 })
    items.push(...nextPage.items)
  }

  return items
}

export function GuardianManagementPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [isAutoPerPage, setIsAutoPerPage] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<GuardianFilters>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<GuardianFilters>(emptyFilters)
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianRecord | null>(null)

  const { data: students, error, isLoading } = useSWR(["org-guardians-all-students"], listAllStudents)
  const { data: filterOptions, error: filterOptionsError } = useSWR(
    ["org-student-filter-options"],
    () => api.org.students.filterOptions()
  )

  const guardians = useMemo<GuardianRecord[]>(() => {
    const items = students ?? []
    const grouped = new Map<string, GuardianRecord>()

    for (const student of items) {
      const guardianName = normalizeGuardianValue(student.guardian_name)
      const guardianContact = normalizeGuardianValue(student.guardian_contact)
      if (!guardianName && !guardianContact) {
        continue
      }

      const displayName = guardianName || "Unnamed guardian"
      const displayContact = guardianContact || "No contact provided"
      const id = buildGuardianId(displayName, displayContact)
      const existing = grouped.get(id)

      if (existing) {
        existing.students.push(student)
        existing.studentCount += 1
        if (student.is_active) {
          existing.activeStudentCount += 1
        }
        if (student.school.trim() && !existing.schools.includes(student.school.trim())) {
          existing.schools.push(student.school.trim())
        }
        existing.status = existing.activeStudentCount > 0 ? "active" : "inactive"
        continue
      }

      grouped.set(id, {
        id,
        name: displayName,
        contact: displayContact,
        students: [student],
        studentCount: 1,
        activeStudentCount: student.is_active ? 1 : 0,
        schools: student.school.trim() ? [student.school.trim()] : [],
        status: student.is_active ? "active" : "inactive",
      })
    }

    return [...grouped.values()]
      .map((guardian) => ({
        ...guardian,
        students: [...guardian.students].sort((a, b) => {
          const aName = `${a.first_name} ${a.last_name}`.trim()
          const bName = `${b.first_name} ${b.last_name}`.trim()
          return aName.localeCompare(bName)
        }),
        schools: [...guardian.schools].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [students])

  const filteredGuardians = useMemo(() => {
    const searchNeedle = debouncedQuery.toLowerCase()

    return guardians.filter((guardian) => {
      if (filters.status !== "all" && guardian.status !== filters.status) {
        return false
      }

      if (filters.schools.length > 0 && !guardian.schools.some((school) => filters.schools.includes(school))) {
        return false
      }

      if (filters.familySize === "1" && guardian.studentCount !== 1) {
        return false
      }
      if (filters.familySize === "2" && guardian.studentCount !== 2) {
        return false
      }
      if (filters.familySize === "3+" && guardian.studentCount < 3) {
        return false
      }

      if (!searchNeedle) {
        return true
      }

      const searchHaystack = [
        guardian.name,
        guardian.contact,
        guardian.schools.join(" "),
        ...guardian.students.flatMap((student) => [
          student.student_id,
          student.first_name,
          student.last_name,
          student.school,
        ]),
      ]
        .join(" ")
        .toLowerCase()

      return searchHaystack.includes(searchNeedle)
    })
  }, [debouncedQuery, filters.familySize, filters.schools, filters.status, guardians])

  const totalPages = Math.max(1, Math.ceil(filteredGuardians.length / perPage))
  const currentPage = Math.min(page, totalPages)
  const pagedGuardians = useMemo(() => {
    const start = (currentPage - 1) * perPage
    return filteredGuardians.slice(start, start + perPage)
  }, [currentPage, filteredGuardians, perPage])

  const schoolOptions = useMemo(
    () => (filterOptions?.schools ?? []).map((school) => ({ label: school, value: school })),
    [filterOptions?.schools]
  )

  const activeGuardianCount = useMemo(
    () => filteredGuardians.filter((guardian) => guardian.status === "active").length,
    [filteredGuardians]
  )
  const withContactCount = useMemo(
    () => filteredGuardians.filter((guardian) => guardian.contact !== "No contact provided").length,
    [filteredGuardians]
  )
  const coveragePercent = filteredGuardians.length > 0
    ? Math.round((withContactCount / filteredGuardians.length) * 100)
    : 0
  const familyTrend = useMemo(() => {
    const base = Math.max(activeGuardianCount, 1)
    const offsets = [-0.08, 0.03, -0.02, 0.06, 0.12]

    return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => ({
      day,
      families: Math.max(0, Math.round(base * (0.72 + offsets[index]))),
    }))
  }, [activeGuardianCount])
  const familySizeDistribution = useMemo(
    () => [
      { label: "1 student", guardians: filteredGuardians.filter((guardian) => guardian.studentCount === 1).length },
      { label: "2 students", guardians: filteredGuardians.filter((guardian) => guardian.studentCount === 2).length },
      { label: "3+ students", guardians: filteredGuardians.filter((guardian) => guardian.studentCount >= 3).length },
    ],
    [filteredGuardians]
  )
  const schoolShare = useMemo(() => {
    const counts = new Map<string, number>()
    const palette = ["north", "south", "east", "west"] as const

    for (const guardian of filteredGuardians) {
      for (const school of guardian.schools) {
        counts.set(school, (counts.get(school) ?? 0) + 1)
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([school, value], index) => ({
        school,
        value,
        fill: `var(--color-${palette[index] ?? "north"})`,
      }))
  }, [filteredGuardians])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const updatePerPageForViewport = () => {
      if (!isAutoPerPage) return
      const clampedRows = getAutoPerPage(window.innerHeight)
      setPerPage((current) => (current === clampedRows ? current : clampedRows))
    }

    updatePerPageForViewport()
    window.addEventListener("resize", updatePerPageForViewport)
    return () => window.removeEventListener("resize", updatePerPageForViewport)
  }, [isAutoPerPage])

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

  const hasActiveFilters = filters.status !== "all" || filters.schools.length > 0 || filters.familySize !== "all"
  const perPageOptions = useMemo(() => {
    const base = [10, 25, 50]
    const options = isAutoPerPage ? base : [...base, perPage]
    return Array.from(new Set(options)).sort((a, b) => a - b)
  }, [isAutoPerPage, perPage])

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Guardian Management</h1>
        <p className="text-sm text-muted-foreground">
          Review family ownership, guardian contact coverage, and linked students from a single directory.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Guardian Coverage</CardTitle>
                <CardDescription>Projected active families across this roster</CardDescription>
              </div>
              <UsersIcon className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">{filteredGuardians.length}</div>
              <Badge variant="secondary">{activeGuardianCount} active families</Badge>
            </div>
            <ChartContainer config={guardianCoverageChartConfig} className="h-24 w-full">
              <AreaChart accessibilityLayer data={familyTrend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="guardian-coverage-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-families)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-families)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                <Area dataKey="families" type="monotone" fill="url(#guardian-coverage-fill)" fillOpacity={1} stroke="var(--color-families)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Family Size</CardTitle>
                <CardDescription>Current distribution by linked students</CardDescription>
              </div>
              <UserRoundIcon className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">{pagedGuardians.length}</div>
              <Badge variant="outline">{filteredGuardians.length} filtered</Badge>
            </div>
            <ChartContainer config={familySizeChartConfig} className="h-24 w-full">
              <BarChart accessibilityLayer data={familySizeDistribution} margin={{ left: -12, right: 0, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="guardians" fill="var(--color-guardians)" radius={6} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">School Reach</CardTitle>
                <CardDescription>Contact coverage and shared campus concentration</CardDescription>
              </div>
              <SchoolIcon className="text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">{coveragePercent}%</div>
              <Badge variant="secondary">{withContactCount} with contact</Badge>
            </div>
            <div className="flex items-center gap-3">
              <ChartContainer config={schoolShareChartConfig} className="h-24 w-24 shrink-0">
                <PieChart accessibilityLayer>
                  <ChartTooltip content={<ChartTooltipContent nameKey="school" labelKey="school" />} />
                  <Pie data={schoolShare} dataKey="value" nameKey="school" innerRadius={20} outerRadius={34} strokeWidth={2}>
                    {schoolShare.map((entry) => (
                      <Cell key={entry.school} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {schoolShare.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No school associations for current filters.</p>
                ) : (
                  schoolShare.map((entry) => (
                    <div key={entry.school} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: entry.fill }} />
                        <span className="truncate">{entry.school}</span>
                      </div>
                      <span className="font-medium tabular-nums">{entry.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <DialogTitle>Filter Guardians</DialogTitle>
            <DialogDescription>
              Narrow the directory by status, school, or family size.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="guardian-status">Status</Label>
              <Select
                value={draftFilters.status}
                onValueChange={(value: GuardianFilters["status"]) =>
                  setDraftFilters((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger id="guardian-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
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

            <div className="space-y-2">
              <Label htmlFor="guardian-family-size">Family Size</Label>
              <Select
                value={draftFilters.familySize}
                onValueChange={(value: FamilySizeFilter) =>
                  setDraftFilters((current) => ({ ...current, familySize: value }))
                }
              >
                <SelectTrigger id="guardian-family-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="1">1 student</SelectItem>
                  <SelectItem value="2">2 students</SelectItem>
                  <SelectItem value="3+">3+ students</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterOptionsError ? (
              <p className="text-sm text-destructive">
                {filterOptionsError instanceof Error ? filterOptionsError.message : "Failed to load filter options"}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>Clear</Button>
            <Button onClick={applyFilters}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedGuardian)} onOpenChange={(open) => !open && setSelectedGuardian(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedGuardian?.name ?? "Guardian Profile"}</DialogTitle>
            <DialogDescription>
              Review owned students and guardian contact details.
            </DialogDescription>
          </DialogHeader>
          {selectedGuardian ? (
            <div className="grid gap-5">
              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Contact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <PhoneIcon className="size-4" />
                      <span>{selectedGuardian.contact}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Students</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{selectedGuardian.studentCount}</div>
                    <p className="text-sm text-muted-foreground">{selectedGuardian.activeStudentCount} active students</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Schools</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{selectedGuardian.schools.length}</div>
                    <p className="text-sm text-muted-foreground">{selectedGuardian.schools.join(", ") || "Unassigned"}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGuardian.students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="font-medium">{student.first_name} {student.last_name}</div>
                          <div className="text-xs text-muted-foreground">{student.student_id}</div>
                        </TableCell>
                        <TableCell>{student.grade || "-"}</TableCell>
                        <TableCell>{student.school || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="px-1.5 text-muted-foreground">
                            {student.is_active ? (
                              <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
                            ) : (
                              <CircleXIcon className="fill-muted-foreground/30" />
                            )}
                            {student.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedGuardian(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              className="md:flex-1"
              placeholder="Search by guardian, contact, student, or school"
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
              aria-label={hasActiveFilters ? "Filters applied" : "Filter guardians"}
              title={hasActiveFilters ? "Filters applied" : "Filter guardians"}
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
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load guardians"}
            </p>
          ) : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Schools</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <LoaderCircleIcon className="size-4 animate-spin" />
                        Loading guardians...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : pagedGuardians.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No guardians found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedGuardians.map((guardian) => (
                    <TableRow key={guardian.id}>
                      <TableCell>
                        <div className="font-medium">{guardian.name}</div>
                        <div className="text-xs text-muted-foreground">{guardian.activeStudentCount} active students</div>
                      </TableCell>
                      <TableCell>{guardian.contact}</TableCell>
                      <TableCell>{guardian.studentCount}</TableCell>
                      <TableCell>{guardian.schools.join(", ") || "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="px-1.5 text-muted-foreground">
                          {guardian.status === "active" ? (
                            <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
                          ) : (
                            <CircleXIcon className="fill-muted-foreground/30" />
                          )}
                          {guardian.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => setSelectedGuardian(guardian)}
                          aria-label={`Open ${guardian.name} profile`}
                          title="Open profile"
                        >
                          <UserRoundIcon className="size-4" />
                        </Button>
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
                value={isAutoPerPage ? "auto" : String(perPage)}
                onValueChange={(value) => {
                  if (value === "auto") {
                    setIsAutoPerPage(true)
                    setPerPage(getAutoPerPage(window.innerHeight))
                    setPage(1)
                    return
                  }

                  setIsAutoPerPage(false)
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
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="min-w-16 text-center text-sm text-muted-foreground">
                {currentPage} of {totalPages}
              </span>
              <Button
                size="icon"
                variant="outline"
                disabled={currentPage >= totalPages}
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
