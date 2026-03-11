"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

function isExpiringSoon(date: string | null) {
  if (!date) return false
  const diff = new Date(date).getTime() - Date.now()
  return diff > 0 && diff < FOURTEEN_DAYS_MS
}

export default function BillingPage() {
  const { data: billingList } = useSWR("platform-billing", () =>
    api.platform.billing.listAll()
  )

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "default"
      case "pilot": return "secondary"
      case "cancelled": return "destructive"
      default: return "outline"
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>
      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Org ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pilot Ends</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billingList?.map((b) => (
                <TableRow key={b.id} className={isExpiringSoon(b.pilot_ends_at) ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                  <TableCell className="font-mono text-xs">{b.org_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={statusColor(b.billing_status) as "default" | "secondary" | "destructive" | "outline"}>{b.billing_status}</Badge>
                  </TableCell>
                  <TableCell>{b.pilot_ends_at ? new Date(b.pilot_ends_at).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>{b.billing_contact_email || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{b.contract_notes || "-"}</TableCell>
                </TableRow>
              ))}
              {(!billingList || billingList.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No billing records</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
