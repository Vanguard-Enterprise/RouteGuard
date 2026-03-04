import { api, APIError, type Organization, type AuditLog } from '@/lib/api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Users, DollarSign, Tablet, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Overview - RouteGuard',
}

async function getData(): Promise<{ orgs: Organization[]; auditLogs: AuditLog[] }> {
  try {
    const [orgs, auditLogs] = await Promise.all([
      api.admin.organizations.list(),
      api.admin.auditLogs.list(),
    ])
    return { orgs, auditLogs }
  } catch (err) {
    if (err instanceof APIError && err.status === 401) redirect('/staff/login')
    return { orgs: [], auditLogs: [] }
  }
}

export default async function AdminOverviewPage() {
  const { orgs, auditLogs } = await getData()

  const recentOrgs = [...orgs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const recentLogs = [...auditLogs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)

  const stats = [
    {
      label: 'Customers',
      value: orgs.length.toString(),
      sub: 'Total organizations',
      icon: Building2,
      placeholder: false,
    },
    {
      label: 'Total Users',
      value: '--',
      sub: 'Coming soon',
      icon: Users,
      placeholder: true,
    },
    {
      label: 'Revenue',
      value: '--',
      sub: 'Coming soon',
      icon: DollarSign,
      placeholder: true,
    },
    {
      label: 'Active Devices',
      value: '--',
      sub: 'Coming soon',
      icon: Tablet,
      placeholder: true,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform health at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon, placeholder }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${placeholder ? 'text-muted-foreground' : ''}`}>
                {value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lower section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent organizations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent Organizations</CardTitle>
            <Link
              href="/admin/organizations"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrgs.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No organizations yet.</p>
            ) : (
              <div className="divide-y">
                {recentOrgs.map((org) => (
                  <Link
                    key={org.id}
                    href={`/admin/organizations/${org.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{org.slug}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {org.type}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(org.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent audit activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Link
              href="/admin/audit-logs"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
              <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentLogs.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="divide-y">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{log.action}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[log.actor_type, log.target_type].filter(Boolean).join(' - ')}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-4 shrink-0">
                      {new Date(log.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
