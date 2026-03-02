'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, Route } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['morning', 'afternoon', 'midday', 'special']),
  description: z.string().optional(),
  estimated_duration_min: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface RouteFormProps {
  route?: Route
  mode: 'create' | 'edit'
  onSaved?: (route: Route) => void
}

export default function RouteForm({ route, mode, onSaved }: RouteFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: route?.name ?? '',
      type: (route?.type as FormValues['type']) ?? 'morning',
      description: route?.description ?? '',
      estimated_duration_min:
        route?.estimated_duration_min != null ? String(route.estimated_duration_min) : '',
    },
  })

  async function onSubmit(data: FormValues) {
    try {
      const payload = {
        name: data.name,
        type: data.type,
        description: data.description || null,
        estimated_duration_min: data.estimated_duration_min
          ? parseInt(data.estimated_duration_min, 10)
          : null,
      }
      let saved: Route
      if (mode === 'create') {
        saved = await api.routes.create(payload)
      } else if (route) {
        saved = await api.routes.update(route.id, payload)
      } else {
        return
      }
      if (onSaved) {
        onSaved(saved)
      } else if (mode === 'create') {
        router.push(`/dashboard/routes/${saved.id}`)
      } else {
        router.push(`/dashboard/routes/${saved.id}`)
      }
    } catch {
      alert('Failed to save route.')
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-brand-navy)' }}>
          {mode === 'create' ? 'New Route' : 'Edit Route'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Route Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              {...register('name')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="Main St AM Route"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              id="type"
              {...register('type')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white"
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="midday">Midday</option>
              <option value="special">Special</option>
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none"
              placeholder="Optional description…"
            />
          </div>

          <div>
            <label
              htmlFor="estimated_duration_min"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Estimated Duration (minutes)
            </label>
            <input
              id="estimated_duration_min"
              {...register('estimated_duration_min')}
              type="number"
              min={0}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="45"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Route' : 'Save Changes'}
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
