import { api } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import { redirect, notFound } from 'next/navigation'
import { ContactDetailClient } from './contact-detail-client'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/staff/login')
  if (!user.permissions?.includes('contacts:read')) redirect('/admin')

  const { id } = await params

  let submission
  try {
    submission = await api.admin.contacts.get(id)
  } catch {
    notFound()
  }

  return <ContactDetailClient submission={submission} currentUserId={user.id} />
}
