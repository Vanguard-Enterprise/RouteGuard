import { notFound } from 'next/navigation'
import { api, APIError } from '@/lib/api'
import { StaffUserDetailClient } from '@/components/admin/staff-user-detail-client'

export const dynamic = 'force-dynamic'

export default async function StaffUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, allRoles] = await Promise.all([
    api.admin.staff.users.get(id).catch((err) => {
      if (err instanceof APIError && err.status === 404) return null
      throw err
    }),
    api.admin.staff.roles.list(),
  ])
  if (!user) notFound()
  return <StaffUserDetailClient user={user} allRoles={allRoles} />
}
