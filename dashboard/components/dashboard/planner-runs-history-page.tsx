"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"

export function PlannerRunsHistoryPage() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const { data: runsData, isLoading, error, mutate } = useSWR(["planner-runs-history"], () =>
    api.org.plannerRuns.list({ page: 1, per_page: 50 })
  )

  const { data: detailsData, mutate: mutateDetails } = useSWR(
    selectedRunId ? ["planner-run-detail", selectedRunId] : null,
    () => api.org.plannerRuns.get(selectedRunId as string)
  )

  async function publishRun(id: string) {
    try {
      await api.org.plannerRuns.publish(id)
      await Promise.all([mutate(), mutateDetails()])
      toast.success("Planner run published")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish run")
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planner Runs History</h1>
        <p className="text-sm text-muted-foreground">Review draft/published runs, diagnostics, and generated routes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load runs"}</p> : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created At</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                ) : (runsData?.items.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No planner runs found.</TableCell></TableRow>
                ) : (
                  runsData?.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{new Date(run.created_at).toLocaleString()}</TableCell>
                      <TableCell>{run.mode}</TableCell>
                      <TableCell className="capitalize">{run.status}</TableCell>
                      <TableCell>{run.service_window}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedRunId(run.id)}>View</Button>
                          {run.status === "draft" ? (
                            <Button size="sm" onClick={() => publishRun(run.id)}>Publish</Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {detailsData ? (
        <Card>
          <CardHeader>
            <CardTitle>Run Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Routes ({detailsData.routes.length})</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Route</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Seat Use</TableHead>
                      <TableHead>Unassigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsData.routes.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No routes in this run.</TableCell></TableRow>
                    ) : (
                      detailsData.routes.map((route) => (
                        <TableRow key={route.id}>
                          <TableCell>{route.route_code}</TableCell>
                          <TableCell>{route.status}</TableCell>
                          <TableCell>{route.assigned_students}</TableCell>
                          <TableCell>{route.seat_utilization.toFixed(1)}%</TableCell>
                          <TableCell>{route.unassigned_count}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Issues ({detailsData.issues.length})</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsData.issues.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No issues reported.</TableCell></TableRow>
                    ) : (
                      detailsData.issues.map((issue) => (
                        <TableRow key={issue.id}>
                          <TableCell className="capitalize">{issue.severity}</TableCell>
                          <TableCell>{issue.issue_type}</TableCell>
                          <TableCell>{issue.message}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
