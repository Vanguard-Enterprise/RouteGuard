"use client"

import { CircleCheckIcon, CircleXIcon, LoaderIcon } from "lucide-react"
import { SupportTicket } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function statusBadge(ticket: SupportTicket) {
  if (ticket.status === "open") {
    return (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
        Open
      </Badge>
    )
  }
  if (ticket.status === "in_progress") {
    return (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        <LoaderIcon />
        In Progress
      </Badge>
    )
  }
  if (ticket.status === "waiting") {
    return (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        <LoaderIcon />
        Waiting
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="px-1.5 text-muted-foreground">
      <CircleXIcon className="fill-muted-foreground/30" />
      Resolved
    </Badge>
  )
}

export function SupportTicketsTable({
  tickets,
  selectedTicketId,
  onSelectTicket,
  loading,
  emptyText,
  showOrgColumn = false,
}: {
  tickets: SupportTicket[]
  selectedTicketId: string | null
  onSelectTicket: (ticketId: string) => void
  loading: boolean
  emptyText: string
  showOrgColumn?: boolean
}) {
  const colSpan = showOrgColumn ? 5 : 4

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead className="w-8">
              <Checkbox aria-label="Select all rows" />
            </TableHead>
            <TableHead>Subject</TableHead>
            {showOrgColumn ? <TableHead>Org</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          ) : null}
          {!loading && tickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          ) : null}
          {tickets.map((ticket) => (
            <TableRow
              key={ticket.id}
              tabIndex={0}
              className={`cursor-pointer ${ticket.id === selectedTicketId ? "bg-muted/50" : ""}`}
              onClick={() => onSelectTicket(ticket.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelectTicket(ticket.id)
                }
              }}
            >
              <TableCell>
                <Checkbox checked={ticket.id === selectedTicketId} aria-label={`Select ${ticket.subject}`} />
              </TableCell>
              <TableCell className="font-medium">{ticket.subject}</TableCell>
              {showOrgColumn ? <TableCell className="text-muted-foreground">{ticket.org_id}</TableCell> : null}
              <TableCell>{statusBadge(ticket)}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {new Date(ticket.last_message_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
