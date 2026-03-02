'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, School } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  lat: z.string().optional(),
  lng: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface SchoolFormProps {
  school?: School
  mode: 'create' | 'edit'
}

export default function SchoolForm({ school, mode }: SchoolFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: school?.name ?? '',
      address: school?.address ?? '',
      city: school?.city ?? '',
      state: school?.state ?? '',
      zip: school?.zip ?? '',
      phone: school?.phone ?? '',
      contact_name: school?.contact_name ?? '',
      contact_email: school?.contact_email ?? '',
      lat: school?.lat != null ? String(school.lat) : '',
      lng: school?.lng != null ? String(school.lng) : '',
    },
  })

  async function onSubmit(data: FormValues) {
    try {
      const parsedLat = data.lat ? parseFloat(data.lat) : null
      const parsedLng = data.lng ? parseFloat(data.lng) : null
      const payload = {
        ...data,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        phone: data.phone || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        lat: parsedLat === null || isNaN(parsedLat) ? null : parsedLat,
        lng: parsedLng === null || isNaN(parsedLng) ? null : parsedLng,
      }
      if (mode === 'create') {
        await api.schools.create(payload)
        router.push('/dashboard/schools')
      } else if (school) {
        await api.schools.update(school.id, payload)
        router.push(`/dashboard/schools/${school.id}`)
      }
    } catch {
      alert('Failed to save school.')
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-brand-navy)' }}>
          {mode === 'create' ? 'New School' : 'Edit School'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              School Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              {...register('name')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="Lincoln Elementary"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
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
            <div className="col-span-1">
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
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="CA"
                maxLength={2}
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
            <label htmlFor="contact_name" className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name
            </label>
            <input
              id="contact_name"
              {...register('contact_name')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700 mb-1">
              Contact Email
            </label>
            <input
              id="contact_email"
              {...register('contact_email')}
              type="email"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="jsmith@school.edu"
            />
            {errors.contact_email && (
              <p className="mt-1 text-xs text-red-500">{errors.contact_email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lat" className="block text-sm font-medium text-gray-700 mb-1">
                Latitude
                <span className="ml-1 text-xs text-gray-400">(auto-filled in route builder)</span>
              </label>
              <input
                id="lat"
                {...register('lat')}
                type="number"
                step="any"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="37.7749"
              />
              {errors.lat && <p className="mt-1 text-xs text-red-500">{errors.lat.message}</p>}
            </div>
            <div>
              <label htmlFor="lng" className="block text-sm font-medium text-gray-700 mb-1">
                Longitude
                <span className="ml-1 text-xs text-gray-400">(auto-filled in route builder)</span>
              </label>
              <input
                id="lng"
                {...register('lng')}
                type="number"
                step="any"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="-122.4194"
              />
              {errors.lng && <p className="mt-1 text-xs text-red-500">{errors.lng.message}</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create School' : 'Save Changes'}
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
