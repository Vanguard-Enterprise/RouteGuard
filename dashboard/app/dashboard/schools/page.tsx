import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import SchoolTable from '@/components/dashboard/school-table'

async function getSchools() {
  try {
    return await api.schools.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Schools — RouteGuard',
}

export default async function SchoolsPage() {
  const schools = await getSchools()

  return (
    <div>
      <SchoolTable schools={schools} />
    </div>
  )
}
