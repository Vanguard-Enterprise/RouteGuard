'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, Driver } from '@/lib/api'

const schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  license_number: z.string().optional(),
  license_expiry: z.string().optional(),
  rfid_badge_id: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']),
})

type FormValues = z.infer<typeof schema>

interface DriverFormProps {
  driver?: Driver
  mode: 'create' | 'edit'
}

export default function DriverForm({ driver, mode }: DriverFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: driver?.first_name ?? '',
      last_name: driver?.last_name ?? '',
      phone: driver?.phone ?? '',
      license_number: '',
      license_expiry: driver?.license_expiry
        ? driver.license_expiry.slice(0, 10)
        : '',
      rfid_badge_id: '',
      status: (driver?.status as 'active' | 'inactive' | 'suspended') ?? 'active',
    },
  })

  async function onSubmit(data: FormValues) {
    try {
      const payload: Partial<Driver> = {
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone || null,
        status: data.status,
        license_expiry: data.license_expiry || null,
      }
      if (data.license_number) {
        payload.license_number = data.license_number
      }
      if (data.rfid_badge_id) {
        payload.rfid_badge_id = data.rfid_badge_id
      }

      if (mode === 'create') {
        await api.drivers.create(payload)
        router.push('/dashboard/drivers')
      } else if (driver) {
        await api.drivers.update(driver.id, payload)
        router.push(`/dashboard/drivers/${driver.id}`)
      }
      router.refresh()
    } catch {
      alert('Failed to save driver.')
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-brand-navy)' }}>
          {mode === 'create' ? 'New Driver' : 'Edit Driver'}
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
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              id="phone"
              {...register('phone')}
              type="tel"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="(555) 000-0000"
            />
          </div>

          <div>
            <label
              htmlFor="license_number"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              License Number
              {mode === 'edit' && driver?.license_number && (
                <span className="ml-2 text-xs text-gray-400">(leave blank to keep current)</span>
              )}
            </label>
            <input
              id="license_number"
              {...register('license_number')}
              type="password"
              autoComplete="off"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder={
                mode === 'edit' && driver?.license_number ? '••••••••' : 'Enter license number'
              }
            />
          </div>

          <div>
            <label
              htmlFor="license_expiry"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              License Expiry
            </label>
            <input
              id="license_expiry"
              {...register('license_expiry')}
              type="date"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>

          <div>
            <label htmlFor="rfid_badge_id" className="block text-sm font-medium text-gray-700 mb-1">
              RFID Badge
              {mode === 'edit' && driver?.rfid_badge_id && (
                <span className="ml-2 text-xs text-gray-400">(leave blank to keep current)</span>
              )}
            </label>
            <input
              id="rfid_badge_id"
              {...register('rfid_badge_id')}
              type="password"
              autoComplete="off"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder={
                mode === 'edit' && driver?.rfid_badge_id ? '••••••••' : 'Scan or enter badge ID'
              }
            />
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
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <p className="text-xs text-gray-400">
            Driver PIN is managed separately via the &quot;Set PIN&quot; action.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Driver' : 'Save Changes'}
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
