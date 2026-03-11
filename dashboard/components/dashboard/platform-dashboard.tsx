"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BuildingIcon, UsersIcon, WifiIcon, BusIcon } from "lucide-react"
import Link from "next/link"

export function PlatformDashboard() {
  const { data: stats } = useSWR("platform-stats", () => api.platform.stats())
  const { data: audit } = useSWR("platform-audit-recent", () =>
    api.platform.audit.list({ limit: 20 })
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_orgs ?? "-"}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.suspended_orgs ?? 0} suspended
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users ?? "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <WifiIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_sessions ?? "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Trips</CardTitle>
            <BusIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_trips ?? "-"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Security Activity</CardTitle>
          <Link href="/dashboard/admin/audit" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {audit?.items?.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <span className="font-medium">{event.actor_email}</span>
                  <span className="text-muted-foreground ml-2">{event.event_type}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {(!audit?.items || audit.items.length === 0) && (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
