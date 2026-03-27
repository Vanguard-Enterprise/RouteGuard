"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { api, SupportTicketStatus } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SupportTicketsTable } from "@/components/dashboard/support-tickets-table"

const statusOptions: Array<{ value: "all" | SupportTicketStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
]

export default function AdminSupportPage() {
  const [statusFilter, setStatusFilter] = useState<"all" | SupportTicketStatus>("all")
  const [orgFilter, setOrgFilter] = useState("")
  const [assignedFilter, setAssignedFilter] = useState("")
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [streamConnected, setStreamConnected] = useState(false)

  const ticketsKey = useMemo(
    () => ["support-admin-tickets", statusFilter, orgFilter, assignedFilter],
    [statusFilter, orgFilter, assignedFilter]
  )
  const { data: ticketsData, isLoading: ticketsLoading, mutate: mutateTickets } = useSWR(ticketsKey, () =>
    api.platform.support.listTickets({
      status: statusFilter === "all" ? undefined : statusFilter,
      org_id: orgFilter.trim() || undefined,
      assigned_to: assignedFilter.trim() || undefined,
      page: 1,
      per_page: 100,
    })
  )

  useEffect(() => {
    let closed = false
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      source = new EventSource("/api/platform/support/stream", { withCredentials: true })
      source.onopen = () => {
        if (!closed) setStreamConnected(true)
      }
      source.onmessage = () => {
        mutateTickets()
      }
      source.onerror = () => {
        if (source) source.close()
        if (closed) return
        setStreamConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      closed = true
      setStreamConnected(false)
      if (source) source.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [mutateTickets])

  useEffect(() => {
    if (streamConnected) return
    const id = setInterval(() => {
      mutateTickets()
    }, 5000)
    return () => clearInterval(id)
  }, [streamConnected, mutateTickets])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Support Inbox</h1>
        <Badge variant={streamConnected ? "default" : "outline"}>
          {streamConnected ? "Live" : "Polling"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | SupportTicketStatus)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Filter by org ID..." value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} />
        <Input placeholder='Assigned admin ("unassigned" or user id)' value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} />
      </div>

      <Card className="h-[70vh] overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(70vh-76px)] overflow-y-auto">
          <SupportTicketsTable
            tickets={ticketsData?.items ?? []}
            selectedTicketId={selectedTicketId}
            onSelectTicket={setSelectedTicketId}
            loading={ticketsLoading}
            emptyText="No tickets found."
            showOrgColumn
          />
        </CardContent>
      </Card>
    </div>
  )
}
