import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import StudentForm from '@/components/dashboard/student-form'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getStudent(id: string) {
  try {
    return await api.students.get(id)
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === 401) redirect('/staff/login')
      if (err.status === 404) notFound()
    }
    return null
  }
}

async function getSchools() {
  try {
    return await api.schools.list()
  } catch {
    return []
  }
}

export default async function EditStudentPage({ params }: PageProps) {
  const { id } = await params
  const [student, schools] = await Promise.all([getStudent(id), getSchools()])
  if (!student) notFound()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/dashboard/students/${id}`}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
          Edit Student
        </h1>
      </div>
      <StudentForm student={student} schools={schools} mode="edit" />
    </div>
  )
}
