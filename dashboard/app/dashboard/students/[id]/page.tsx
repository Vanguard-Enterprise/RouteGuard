import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, ArrowLeft } from 'lucide-react'
import StudentGuardians from '@/components/dashboard/student-guardians'

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

async function getGuardians(id: string) {
  try {
    return await api.students.guardians.list(id)
  } catch {
    return []
  }
}

export default async function StudentDetailPage({ params }: PageProps) {
  const { id } = await params
  const [student, guardians] = await Promise.all([getStudent(id), getGuardians(id)])
  if (!student) notFound()

  const school = await api.schools.get(student.school_id).catch(() => null)

  const fields: { label: string; value: string }[] = [
    { label: 'ID', value: student.id },
    { label: 'First Name', value: student.first_name },
    { label: 'Last Name', value: student.last_name },
    { label: 'Student #', value: student.student_number ?? '—' },
    { label: 'Grade', value: student.grade ?? '—' },
    { label: 'School', value: school?.name ?? student.school_id },
    { label: 'Status', value: student.status },
    { label: 'Address', value: student.address ?? '—' },
    { label: 'City', value: student.city ?? '—' },
    { label: 'State', value: student.state ?? '—' },
    { label: 'ZIP', value: student.zip ?? '—' },
    { label: 'RFID Tag', value: student.rfid_tag_id ? '••••••••' : '—' },
    { label: 'Medical Notes', value: student.medical_notes ?? '—' },
    { label: 'Created', value: new Date(student.created_at).toLocaleString() },
    { label: 'Updated', value: new Date(student.updated_at).toLocaleString() },
  ]

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/students"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-brand-navy)' }}>
            {student.first_name} {student.last_name}
          </h1>
        </div>
        <Link
          href={`/dashboard/students/${student.id}/edit`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex px-5 py-3">
            <span className="w-32 text-sm text-gray-500 shrink-0">{label}</span>
            <span className="text-sm text-gray-900 font-medium break-all">{value}</span>
          </div>
        ))}
      </div>

      <StudentGuardians studentId={student.id} initialGuardians={guardians} />
    </div>
  )
}
