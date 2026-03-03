import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import { AuditLogTable } from '@/components/admin/audit-log-table'

async function getAuditLogs() {
  try {
    return await api.admin.auditLogs.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Audit Logs — RouteGuard Admin',
}

export default async function AuditLogsPage() {
  const logs = await getAuditLogs()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Audit Logs</h2>
        <p className="text-sm text-muted-foreground mt-1">All admin and user actions across the platform.</p>
      </div>
      <AuditLogTable logs={logs} />
    </div>
  )
}
