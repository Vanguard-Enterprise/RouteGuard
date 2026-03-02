import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import OrganizationForm from '@/components/admin/organization-form'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getOrg(id: string) {
  try {
    return await api.admin.organizations.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

export default async function EditOrganizationPage({ params }: PageProps) {
  const { id } = await params
  const org = await getOrg(id)
  if (!org) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        Edit Organization
      </h1>
      <OrganizationForm organization={org} mode="edit" />
    </div>
  )
}
