import { api } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  closed: 'Closed',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  in_progress: 'secondary',
  closed: 'outline',
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/staff/login')
  if (!user.permissions?.includes('contacts:read')) redirect('/admin')

  const params = await searchParams
  const submissions = await api.admin.contacts
    .list(params.status ? { status: params.status } : undefined)
    .catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contact Submissions</h1>
        <p className="text-muted-foreground mt-1">Inbound inquiries from the public contact form.</p>
      </div>

      <div className="flex gap-2">
        {(['', 'new', 'in_progress', 'closed'] as const).map((s) => (
          <Link
            key={s || 'all'}
            href={s ? `/admin/contacts?status=${s}` : '/admin/contacts'}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              (params.status ?? '') === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </Link>
        ))}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium w-4"></th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No submissions found.
                </td>
              </tr>
            )}
            {submissions.map((sub) => (
              <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  {!sub.read_at && (
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="Unread" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/contacts/${sub.id}`} className="font-medium hover:underline">
                    {sub.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{sub.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{sub.organization}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANTS[sub.status]}>
                    {STATUS_LABELS[sub.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
