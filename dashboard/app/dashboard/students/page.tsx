"use client"

import { useMemo, useState } from "react"
import { UsersIcon, ShieldCheckIcon, AlertTriangleIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

type StudentStatus = "On Bus" | "At School" | "Absent"

type Student = {
  id: string
  name: string
  grade: string
  school: string
  route: string
  stop: string
  guardian: string
  status: StudentStatus
}

const students: Student[] = [
  {
    id: "STD-1001",
    name: "Ava Thompson",
    grade: "K",
    school: "North Elementary",
    route: "NE-AM-01",
    stop: "Cedar St & 4th Ave",
    guardian: "Mia Thompson",
    status: "On Bus",
  },
  {
    id: "STD-1002",
    name: "Noah Rodriguez",
    grade: "1",
    school: "North Elementary",
    route: "NE-AM-01",
    stop: "Elm St & Pine Rd",
    guardian: "Carlos Rodriguez",
    status: "At School",
  },
  {
    id: "STD-1003",
    name: "Sophia Patel",
    grade: "2",
    school: "Lakewood Elementary",
    route: "LE-AM-02",
    stop: "Hillside Dr",
    guardian: "Anika Patel",
    status: "At School",
  },
  {
    id: "STD-1004",
    name: "Liam Chen",
    grade: "3",
    school: "Lakewood Elementary",
    route: "LE-AM-02",
    stop: "Maple Ct",
    guardian: "Jing Chen",
    status: "Absent",
  },
  {
    id: "STD-1005",
    name: "Olivia Davis",
    grade: "4",
    school: "Riverside Middle",
    route: "RM-AM-04",
    stop: "River Park Loop",
    guardian: "Kevin Davis",
    status: "On Bus",
  },
  {
    id: "STD-1006",
    name: "Ethan Walker",
    grade: "5",
    school: "Riverside Middle",
    route: "RM-AM-04",
    stop: "Oak Ridge Blvd",
    guardian: "Lauren Walker",
    status: "At School",
  },
  {
    id: "STD-1007",
    name: "Mia Johnson",
    grade: "6",
    school: "Westview High",
    route: "WH-AM-07",
    stop: "Westview Station",
    guardian: "Derrick Johnson",
    status: "At School",
  },
  {
    id: "STD-1008",
    name: "James Martinez",
    grade: "7",
    school: "Westview High",
    route: "WH-AM-07",
    stop: "Summit Apartments",
    guardian: "Elena Martinez",
    status: "Absent",
  },
  {
    id: "STD-1009",
    name: "Charlotte Brown",
    grade: "8",
    school: "South Middle",
    route: "SM-AM-03",
    stop: "Southgate Plaza",
    guardian: "Nina Brown",
    status: "On Bus",
  },
  {
    id: "STD-1010",
    name: "Benjamin Lee",
    grade: "9",
    school: "Central High",
    route: "CH-AM-09",
    stop: "Parkside Ln",
    guardian: "Grace Lee",
    status: "At School",
  },
]

function statusBadgeVariant(status: StudentStatus): "default" | "secondary" | "destructive" {
  if (status === "On Bus") return "default"
  if (status === "At School") return "secondary"
  return "destructive"
}

export default function StudentsPage() {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | StudentStatus>("all")
  const [gradeFilter, setGradeFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    return students.filter((student) => {
      const matchesQuery =
        query.trim() === "" ||
        student.name.toLowerCase().includes(query.toLowerCase()) ||
        student.id.toLowerCase().includes(query.toLowerCase()) ||
        student.route.toLowerCase().includes(query.toLowerCase())

      const matchesStatus = statusFilter === "all" || student.status === statusFilter
      const matchesGrade = gradeFilter === "all" || student.grade === gradeFilter

      return matchesQuery && matchesStatus && matchesGrade
    })
  }, [query, statusFilter, gradeFilter])

  const onBusCount = students.filter((student) => student.status === "On Bus").length
  const absentCount = students.filter((student) => student.status === "Absent").length

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">
          Monitor riders, attendance status, and assigned routes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <UsersIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{students.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently On Bus</CardTitle>
            <ShieldCheckIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{onBusCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
            <AlertTriangleIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{absentCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Roster</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Search by name, ID, or route..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as "all" | StudentStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                sideOffset={4}
                className="w-[var(--radix-select-trigger-width)]"
              >
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="On Bus">On Bus</SelectItem>
                <SelectItem value="At School">At School</SelectItem>
                <SelectItem value="Absent">Absent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by grade" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                sideOffset={4}
                className="w-[var(--radix-select-trigger-width)]"
              >
                <SelectItem value="all">All grades</SelectItem>
                <SelectItem value="K">K</SelectItem>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="7">7</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="9">9</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Stop</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No students match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-muted-foreground">{student.id}</div>
                      </TableCell>
                      <TableCell>{student.grade}</TableCell>
                      <TableCell>{student.school}</TableCell>
                      <TableCell>{student.route}</TableCell>
                      <TableCell>{student.stop}</TableCell>
                      <TableCell>{student.guardian}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(student.status)}>{student.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
