'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, FormProvider } from 'react-hook-form'
import AddressAutocomplete from '@/components/dashboard/address-autocomplete'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronDown, ScanLine, CheckCircle, X, Loader2 } from 'lucide-react'
import { api, School, Student } from '@/lib/api'

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  school_id: z.string().min(1, 'School is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  student_number: z.string().optional(),
  grade: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  medical_notes: z.string().optional(),
  rfid_tag_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface StudentFormProps {
  student?: Student
  schools: School[]
  mode: 'create' | 'edit'
}

type ScanState = 'idle' | 'waiting' | 'scanned' | 'error'

export default function StudentForm({ student, schools, mode }: StudentFormProps) {
  const router = useRouter()
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanCode, setScanCode] = useState('')
  const [scanError, setScanError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const codeRef = useRef('')

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  const startScan = async () => {
    setScanError('')
    setScanState('waiting')
    try {
      const { code } = await api.rfidEnroll.create()
      setScanCode(code)
      codeRef.current = code
      pollRef.current = setInterval(async () => {
        try {
          const result = await api.rfidEnroll.poll(codeRef.current)
          if (result.scanned && result.rfid_tag_id) {
            stopPolling()
            methods.setValue('rfid_tag_id', result.rfid_tag_id)
            setScanState('scanned')
          }
        } catch {
          // keep polling on transient errors
        }
      }, 2000)
    } catch {
      setScanState('error')
      setScanError('Failed to start enrollment session.')
    }
  }

  const cancelScan = async () => {
    stopPolling()
    if (codeRef.current) {
      await api.rfidEnroll.cancel(codeRef.current).catch(() => undefined)
      codeRef.current = ''
    }
    setScanState('idle')
    setScanCode('')
  }

  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: student?.first_name ?? '',
      last_name: student?.last_name ?? '',
      school_id: student?.school_id ?? '',
      address: student?.address ?? '',
      city: student?.city ?? '',
      state: student?.state ?? '',
      zip: student?.zip ?? '',
      lat: student?.lat != null ? String(student.lat) : '',
      lng: student?.lng != null ? String(student.lng) : '',
      student_number: student?.student_number ?? '',
      grade: student?.grade ?? '',
      status: (student?.status as 'active' | 'inactive') ?? 'active',
      medical_notes: student?.medical_notes ?? '',
      rfid_tag_id: '',
    },
  })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = methods

  async function onSubmit(data: FormValues) {
    try {
      const payload: Partial<Student> = {
        first_name: data.first_name,
        last_name: data.last_name,
        school_id: data.school_id,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        lat: data.lat ? parseFloat(data.lat) : null,
        lng: data.lng ? parseFloat(data.lng) : null,
        student_number: data.student_number || null,
        grade: data.grade || null,
        status: data.status,
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
    <FormProvider {...methods}>
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

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <AddressAutocomplete name="address" fillLatLng />
          </div>

          {/* city/state/zip/lat/lng stay in form state (populated by AddressAutocomplete) but are hidden */}
          <input type="hidden" {...register('city')} />
          <input type="hidden" {...register('state')} />
          <input type="hidden" {...register('zip')} />
          <input type="hidden" {...register('lat')} />
          <input type="hidden" {...register('lng')} />

          <details className="group">
            <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 mb-3 list-none flex items-center gap-1">
              <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
              More details
            </summary>
            <div className="space-y-4 mt-3">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RFID Tag
                  {mode === 'edit' && student?.rfid_tag_id && scanState === 'idle' && (
                    <span className="ml-2 text-xs text-gray-400">currently assigned</span>
                  )}
                </label>

                {/* Scan-from-device flow */}
                {scanState === 'idle' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={startScan}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors w-full"
                    >
                      <ScanLine className="size-4 text-gray-400 shrink-0" />
                      {mode === 'edit' && student?.rfid_tag_id ? 'Replace tag - scan from device' : 'Scan from device'}
                    </button>
                  </div>
                )}

                {scanState === 'waiting' && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Loader2 className="size-4 text-blue-500 shrink-0 mt-0.5 animate-spin" />
                        <div>
                          <p className="font-medium text-blue-800">Waiting for scan...</p>
                          <p className="text-blue-600 text-xs mt-0.5">
                            On the bus device, tap <strong>Enroll Student RFID</strong> and enter code:
                          </p>
                          <p className="font-mono font-bold text-blue-800 text-lg tracking-widest mt-1">{scanCode}</p>
                          <p className="text-blue-500 text-xs mt-1">Then hold the card to the scanner.</p>
                        </div>
                      </div>
                      <button type="button" onClick={cancelScan} className="text-blue-400 hover:text-blue-600 shrink-0">
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {scanState === 'scanned' && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="size-4 text-green-600 shrink-0" />
                      <span className="text-green-800 font-medium">Card scanned successfully</span>
                    </div>
                    <button type="button" onClick={() => { setScanState('idle'); methods.setValue('rfid_tag_id', '') }} className="text-green-500 hover:text-green-700 shrink-0">
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                {scanState === 'error' && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="text-red-700">{scanError}</span>
                    <button type="button" onClick={() => setScanState('idle')} className="text-red-400 hover:text-red-600">
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                {/* Hidden field stores the actual tag value */}
                <input type="hidden" {...register('rfid_tag_id')} />
              </div>
            </div>
          </details>

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
    </FormProvider>
  )
}
