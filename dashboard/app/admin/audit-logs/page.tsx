import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
      <div className="mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Audit Logs
        </h2>
        <p className="text-sm text-gray-500 mt-1">All admin and user actions across the platform.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-400 py-10">
                  No audit log entries.
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-sm">{log.action}</TableCell>
                <TableCell className="text-sm">
                  {log.actor_id ? (
                    <span>
                      {log.actor_type} <span className="text-gray-400 font-mono">{log.actor_id.slice(0, 8)}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">system</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {log.target_type && log.target_id ? (
                    <span>
                      {log.target_type} <span className="font-mono">{log.target_id.slice(0, 8)}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-sm font-mono text-gray-500">{log.ip_address ?? '—'}</TableCell>
                <TableCell className="text-sm text-gray-500">
                  {new Date(log.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
