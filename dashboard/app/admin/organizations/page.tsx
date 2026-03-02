import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import OrgTable from '@/components/admin/org-table'

async function getOrganizations() {
  try {
    return await api.admin.organizations.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Organizations — RouteGuard Admin',
}

export default async function OrganizationsPage() {
  const orgs = await getOrganizations()

  return (
    <div>
      <OrgTable organizations={orgs} />
    </div>
  )
}
