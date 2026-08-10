"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import type { StopUpsertPayload } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Link2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

const emptyStop: StopUpsertPayload = {
  name: "",
  address: "",
  latitude: 0,
  longitude: 0,
  notes: "",
  is_active: true,
}

export function StopManagementPage() {
  const [stopPayload, setStopPayload] = useState<StopUpsertPayload>(emptyStop)
  const [search, setSearch] = useState("")
  const [selectedStudent, setSelectedStudent] = useState("")
  const [selectedStop, setSelectedStop] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const { data: stopsData, isLoading, error, mutate } = useSWR(["stops", search], () =>
    api.org.stops.list({ search: search || undefined, page: 1, per_page: 100 })
  )
  const { data: studentsData } = useSWR(["students-for-stops"], () =>
    api.org.students.list({ status: "active", page: 1, per_page: 200 })
  )

  const students = useMemo(() => studentsData?.items ?? [], [studentsData?.items])
  const stops = useMemo(() => stopsData?.items ?? [], [stopsData?.items])

  async function createStop() {
    if (!stopPayload.name?.trim() || !stopPayload.address?.trim()) {
      toast.error("Stop name and address are required")
      return
    }
    if (!Number.isFinite(stopPayload.latitude) || !Number.isFinite(stopPayload.longitude)) {
      toast.error("Latitude and longitude are required")
      return
    }

    try {
      await api.org.stops.create(stopPayload)
      setStopPayload(emptyStop)
      setCreateOpen(false)
      mutate()
      toast.success("Stop created")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create stop")
    }
  }

  async function assignStudentToStop() {
    if (!selectedStudent || !selectedStop) {
      toast.error("Select both a student and a stop")
      return
    }
    try {
      await api.org.stops.assignStudent(selectedStudent, { stop_id: selectedStop, service_window: "PM", is_active: true })
      setSelectedStudent("")
      setAssignOpen(false)
      toast.success("Student assigned to PM stop")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign student")
    }
  }

  async function archiveStop(id: string) {
    try {
      await api.org.stops.remove(id)
      mutate()
      toast.success("Stop archived")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive stop")
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stop Management</h1>
          <p className="text-sm text-muted-foreground">Review shared PM drop-off locations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setAssignOpen(true)}><Link2Icon className="size-4" />Assign student</Button>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}><PlusIcon className="size-4" />Create stop</Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create stop</DialogTitle>
            <DialogDescription>Add a shared PM drop-off location.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input placeholder="Stop name" value={stopPayload.name} onChange={(e) => setStopPayload((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Address" value={stopPayload.address} onChange={(e) => setStopPayload((p) => ({ ...p, address: e.target.value }))} />
            <Input placeholder="Notes" value={stopPayload.notes} onChange={(e) => setStopPayload((p) => ({ ...p, notes: e.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="number" step="any" placeholder="Latitude" value={stopPayload.latitude || ""} onChange={(e) => setStopPayload((p) => ({ ...p, latitude: Number(e.target.value) }))} />
              <Input type="number" step="any" placeholder="Longitude" value={stopPayload.longitude || ""} onChange={(e) => setStopPayload((p) => ({ ...p, longitude: Number(e.target.value) }))} />
            </div>
            <Button onClick={createStop}>Create stop</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign student to shared stop</DialogTitle>
            <DialogDescription>Set a student&apos;s PM stop assignment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>{student.first_name} {student.last_name} ({student.student_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStop} onValueChange={setSelectedStop}>
              <SelectTrigger><SelectValue placeholder="Select stop" /></SelectTrigger>
              <SelectContent>
                {stops.map((stop) => (
                  <SelectItem key={stop.id} value={stop.id}>{stop.name} ({stop.stop_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={assignStudentToStop}>Assign PM stop</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Stops</CardTitle>
            <Input className="md:max-w-sm" placeholder="Search stops" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load stops"}</p> : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stop</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                ) : stops.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No stops found.</TableCell></TableRow>
                ) : (
                  stops.map((stop) => (
                    <TableRow key={stop.id}>
                      <TableCell>
                        <div className="font-medium">{stop.name}</div>
                        <div className="text-xs text-muted-foreground">{stop.stop_id}</div>
                      </TableCell>
                      <TableCell>{stop.address}</TableCell>
                      <TableCell>{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</TableCell>
                      <TableCell>{stop.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="destructive" size="sm" onClick={() => archiveStop(stop.id)}>Archive</Button>
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
