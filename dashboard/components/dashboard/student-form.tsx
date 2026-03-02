'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, School, Student } from '@/lib/api'

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  school_id: z.string().min(1, 'School is required'),
  student_number: z.string().optional(),
  grade: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  medical_notes: z.string().optional(),
  rfid_tag_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface StudentFormProps {
  student?: Student
  schools: School[]
  mode: 'create' | 'edit'
}

export default function StudentForm({ student, schools, mode }: StudentFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: student?.first_name ?? '',
      last_name: student?.last_name ?? '',
      school_id: student?.school_id ?? '',
      student_number: student?.student_number ?? '',
      grade: student?.grade ?? '',
      status: (student?.status as 'active' | 'inactive') ?? 'active',
      address: student?.address ?? '',
      city: student?.city ?? '',
      state: student?.state ?? '',
      zip: student?.zip ?? '',
      medical_notes: student?.medical_notes ?? '',
      rfid_tag_id: '',
    },
  })

  async function onSubmit(data: FormValues) {
    try {
      const payload: Partial<Student> = {
        first_name: data.first_name,
        last_name: data.last_name,
        school_id: data.school_id,
        student_number: data.student_number || null,
        grade: data.grade || null,
        status: data.status,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        medical_notes: data.medical_notes || null,
      }
      if (data.rfid_tag_id) {
        payload.rfid_tag_id = data.rfid_tag_id
      }

      if (mode === 'create') {
        await api.students.create(payload)
        router.push('/dashboard/students')
      } else if (student) {
        await api.students.update(student.id, payload)
        router.push(`/dashboard/students/${student.id}`)
      }
    } catch {
      alert('Failed to save student.')
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-brand-navy)' }}>
          {mode === 'create' ? 'New Student' : 'Edit Student'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="first_name"
                {...register('first_name')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              />
              {errors.first_name && (
                <p className="mt-1 text-xs text-red-500">{errors.first_name.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="last_name"
                {...register('last_name')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              />
              {errors.last_name && (
                <p className="mt-1 text-xs text-red-500">{errors.last_name.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="school_id" className="block text-sm font-medium text-gray-700 mb-1">
              School <span className="text-red-500">*</span>
            </label>
            <select
              id="school_id"
              {...register('school_id')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white"
            >
              <option value="">Select a school…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.school_id && (
              <p className="mt-1 text-xs text-red-500">{errors.school_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="student_number"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Student Number
              </label>
              <input
                id="student_number"
                {...register('student_number')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="12345"
              />
            </div>
            <div>
              <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-1">
                Grade
              </label>
              <input
                id="grade"
                {...register('grade')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="3"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              {...register('status')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <input
              id="address"
              {...register('address')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                id="city"
                {...register('city')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                id="state"
                {...register('state')}
                maxLength={2}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="CA"
              />
            </div>
            <div>
              <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-1">
                ZIP
              </label>
              <input
                id="zip"
                {...register('zip')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="90210"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="medical_notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Medical Notes
            </label>
            <textarea
              id="medical_notes"
              {...register('medical_notes')}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none"
              placeholder="Any relevant medical information…"
            />
          </div>

          <div>
            <label htmlFor="rfid_tag_id" className="block text-sm font-medium text-gray-700 mb-1">
              RFID Tag
              {mode === 'edit' && student?.rfid_tag_id && (
                <span className="ml-2 text-xs text-gray-400">(leave blank to keep current)</span>
              )}
            </label>
            <input
              id="rfid_tag_id"
              {...register('rfid_tag_id')}
              type="password"
              autoComplete="off"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder={mode === 'edit' && student?.rfid_tag_id ? '••••••••' : 'Scan or enter tag ID'}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Student' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
