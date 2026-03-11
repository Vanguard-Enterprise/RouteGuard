"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import type { AuditEvent, CursorResponse } from "@/lib/api"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const EVENT_TYPES = [
  "all",
  "login",
  "logout",
  "org.created",
  "org.suspended",
  "org.reactivated",
  "org.deleted",
  "membership.added",
  "membership.removed",
  "role.assigned",
  "role.unassigned",
  "user.disabled",
  "user.enabled",
]

export default function AuditLogPage() {
  const [eventType, setEventType] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [items, setItems] = useState<AuditEvent[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [searched, setSearched] = useState(false)

  const buildParams = (nextCursor?: string) => {
    const params: Record<string, string> = { limit: "50" }
    if (eventType && eventType !== "all") params.event_type = eventType
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    if (nextCursor) params.cursor = nextCursor
    return params
  }

  const handleSearch = async () => {
    setLoading(true)
    setSearched(true)
    try {
      const result: CursorResponse<AuditEvent> = await api.platform.audit.list(buildParams())
      setItems(result.items)
      setCursor(result.next_cursor)
      setHasMore(result.has_more)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = async () => {
    if (!cursor) return
    setLoading(true)
    try {
      const result: CursorResponse<AuditEvent> = await api.platform.audit.list(buildParams(cursor))
      setItems((prev) => [...prev, ...result.items])
      setCursor(result.next_cursor)
      setHasMore(result.has_more)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Event Type</label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "all" ? "All events" : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <Button onClick={handleSearch} disabled={loading}>
              {loading ? "Loading..." : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => (
                <>
                  <TableRow key={event.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{event.actor_email}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {event.event_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.target_id || "-"}
                    </TableCell>
                    <TableCell>
                      {event.metadata && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRow(event.id)}
                        >
                          {expandedRows.has(event.id) ? "Hide" : "Details"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedRows.has(event.id) && event.metadata && (
                    <TableRow key={`${event.id}-meta`}>
                      <TableCell colSpan={5} className="bg-muted/40 py-3">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {searched && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No audit events found
                  </TableCell>
                </TableRow>
              )}
              {!searched && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Use the filters above and click Search to load audit events
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                {loading ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
