'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api, Guardian } from '@/lib/api'

const guardianSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().min(1, 'Phone is required'),
  alt_phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  sms_opt_in: z.boolean(),
  language: z.string().optional(),
})

type GuardianFormValues = z.infer<typeof guardianSchema>

interface StudentGuardiansProps {
  studentId: string
  initialGuardians: Guardian[]
}

export default function StudentGuardians({ studentId, initialGuardians }: StudentGuardiansProps) {
  const [guardians, setGuardians] = useState(initialGuardians)
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GuardianFormValues>({
    resolver: zodResolver(guardianSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      alt_phone: '',
      email: '',
      sms_opt_in: false,
      language: 'en',
    },
  })

  async function onSubmit(data: GuardianFormValues) {
    try {
      const guardian = await api.students.guardians.create(studentId, {
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        alt_phone: data.alt_phone || null,
        email: data.email || null,
        sms_opt_in: data.sms_opt_in,
        language: data.language || 'en',
      })
      setGuardians((prev) => [...prev, guardian])
      reset()
      setOpen(false)
    } catch {
      alert('Failed to add guardian.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-brand-navy)' }}>
          Guardians
        </h2>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand-navy)' }}
        >
          <Plus size={14} />
          Add Guardian
        </button>
      </div>

      {guardians.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-8 text-center text-sm text-gray-400">
          No guardians added yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {guardians.map((g) => (
            <div key={g.id} className="flex items-start gap-4 px-5 py-4">
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {g.first_name} {g.last_name}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{g.phone}</p>
                {g.alt_phone && <p className="text-sm text-gray-400">{g.alt_phone}</p>}
                {g.email && <p className="text-sm text-gray-500">{g.email}</p>}
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>{g.language ?? 'en'}</p>
                {g.sms_opt_in && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                    SMS
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Guardian</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('first_name')}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                {errors.first_name && (
                  <p className="mt-1 text-xs text-red-500">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('last_name')}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                {errors.last_name && (
                  <p className="mt-1 text-xs text-red-500">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                {...register('phone')}
                type="tel"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="(555) 000-0000"
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alternate Phone
              </label>
              <input
                {...register('alt_phone')}
                type="tel"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="(555) 000-0000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                {...register('email')}
                type="email"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="guardian@email.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <input
                {...register('language')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="en"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="sms_opt_in"
                {...register('sms_opt_in')}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              <label htmlFor="sms_opt_in" className="text-sm text-gray-700">
                Opt in to SMS notifications
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-brand-navy)' }}
              >
                {isSubmitting ? 'Adding…' : 'Add Guardian'}
              </button>
              <button
                type="button"
                onClick={() => { reset(); setOpen(false) }}
                className="px-5 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
