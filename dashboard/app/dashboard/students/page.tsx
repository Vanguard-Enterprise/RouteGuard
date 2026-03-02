import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import StudentTable from '@/components/dashboard/student-table'

async function getStudents() {
  try {
    return await api.students.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Students — RouteGuard',
}

export default async function StudentsPage() {
  const students = await getStudents()

  return (
    <div>
      <StudentTable students={students} />
    </div>
  )
}
