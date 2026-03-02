import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import StudentForm from '@/components/dashboard/student-form'

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
  title: 'New Student — RouteGuard',
}

export default async function NewStudentPage() {
  const schools = await getSchools()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/students"
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          New Student
        </h1>
      </div>
      <StudentForm mode="create" schools={schools} />
    </div>
  )
}
