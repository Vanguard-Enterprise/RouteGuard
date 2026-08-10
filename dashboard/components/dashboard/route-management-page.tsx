"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Link2Icon, SlidersHorizontalIcon } from "lucide-react"
import { toast } from "sonner"

export function RouteManagementPage() {
  const [mode, setMode] = useState<"FASTEST_TIME" | "FEWEST_BUSES">("FASTEST_TIME")
  const [selectedDriver, setSelectedDriver] = useState("")
  const [selectedVehicle, setSelectedVehicle] = useState("")

  const { data: routesData, mutate: mutateRoutes } = useSWR(["routes"], () =>
    api.org.routes.list({ page: 1, per_page: 200 })
  )
  const { data: runsData, mutate: mutateRuns } = useSWR(["planner-runs"], () =>
    api.org.plannerRuns.list({ page: 1, per_page: 20 })
  )
  const { data: driversData } = useSWR(["drivers-for-routes"], () =>
    api.org.drivers.list({ status: "available", page: 1, per_page: 200 })
  )
  const { data: vehiclesData } = useSWR(["vehicles-for-routes"], () =>
    api.org.vehicles.list({ status: "active", page: 1, per_page: 200 })
  )
  const { data: assignmentsData, mutate: mutateAssignments } = useSWR(["driver-vehicle-assignments"], () =>
    api.org.routes.listAssignments()
  )

  const latestDraftRun = useMemo(() =>
    (runsData?.items ?? []).find((run) => run.status === "draft"),
  [runsData?.items])

  async function runPlanner() {
    try {
      await api.org.plannerRuns.create({ mode, service_window: "PM" })
      await Promise.all([mutateRuns(), mutateRoutes()])
      toast.success("Planner run created")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create planner run")
    }
  }

  async function publishLatestDraft() {
    if (!latestDraftRun) {
      toast.error("No draft planner run to publish")
      return
    }
    try {
      await api.org.plannerRuns.publish(latestDraftRun.id)
      await Promise.all([mutateRuns(), mutateRoutes()])
      toast.success("Planner run published")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish run")
    }
  }

  async function saveAssignment() {
    if (!selectedDriver || !selectedVehicle) {
      toast.error("Select both a driver and vehicle")
      return
    }
    try {
      await api.org.routes.upsertAssignment({ driver_id: selectedDriver, vehicle_id: selectedVehicle, is_active: true })
      setSelectedDriver("")
      setSelectedVehicle("")
      mutateAssignments()
      toast.success("Driver/vehicle assignment saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save assignment")
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Management</h1>
          <p className="text-sm text-muted-foreground">Review generated routes and open tools only when needed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><SlidersHorizontalIcon className="size-4" />Planner tools</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Planner tools</DialogTitle>
                <DialogDescription>Generate a draft plan, then publish it after review.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Planning objective</p>
                  <Select value={mode} onValueChange={(v: "FASTEST_TIME" | "FEWEST_BUSES") => setMode(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FASTEST_TIME">Fastest ride time</SelectItem>
                      <SelectItem value="FEWEST_BUSES">Fewest buses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={runPlanner}>Create draft plan</Button>
                  <Button variant="outline" onClick={publishLatestDraft}>Publish latest draft</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Latest draft: {latestDraftRun ? new Date(latestDraftRun.created_at).toLocaleString() : "none"}
                </p>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Link2Icon className="size-4" />Pair drivers</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Driver-bus pairings</DialogTitle>
                <DialogDescription>Assign an available driver to an active bus.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-3">
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    {(driversData?.items ?? []).map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>{driver.name} ({driver.driver_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger><SelectValue placeholder="Select bus" /></SelectTrigger>
                  <SelectContent>
                    {(vehiclesData?.items ?? []).map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_id} (cap {vehicle.capacity})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={saveAssignment}>Save pairing</Button>
              </div>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Assignment ID</TableHead><TableHead>Driver ID</TableHead><TableHead>Vehicle ID</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(assignmentsData?.items.length ?? 0) === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No pairings yet.</TableCell></TableRow>
                    ) : assignmentsData?.items.map((item) => (
                      <TableRow key={item.id}><TableCell>{item.id.slice(0, 8)}</TableCell><TableCell>{item.driver_id.slice(0, 8)}</TableCell><TableCell>{item.vehicle_id.slice(0, 8)}</TableCell><TableCell>{item.is_active ? "Active" : "Inactive"}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Routes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Objective</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Seat Use</TableHead>
                  <TableHead>ETA (min)</TableHead>
                  <TableHead>Unassigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(routesData?.items.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No routes generated yet.</TableCell></TableRow>
                ) : (
                  routesData?.items.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell>{route.route_code}</TableCell>
                      <TableCell className="capitalize">{route.status}</TableCell>
                      <TableCell>{route.objective_mode}</TableCell>
                      <TableCell>{route.assigned_students}</TableCell>
                      <TableCell>{route.seat_utilization.toFixed(1)}%</TableCell>
                      <TableCell>{route.estimated_travel_minutes}</TableCell>
                      <TableCell>{route.unassigned_count}</TableCell>
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
