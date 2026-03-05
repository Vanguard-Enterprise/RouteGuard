'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronDown } from 'lucide-react'
import { api, Vehicle, Device } from '@/lib/api'

const schema = z.object({
  number: z.string().min(1, 'Bus number is required'),
  capacity: z.string().optional(),
  device_id: z.string().optional(),
  name: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.string().optional(),
  vin: z.string().optional(),
  license_plate: z.string().optional(),
  status: z.enum(['active', 'maintenance', 'retired']),
})

type FormValues = z.infer<typeof schema>

interface VehicleFormProps {
  vehicle?: Vehicle
  mode: 'create' | 'edit'
}

export default function VehicleForm({ vehicle, mode }: VehicleFormProps) {
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])

  useEffect(() => {
    api.devices.list().then(setDevices).catch(() => {})
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      number: vehicle?.number ?? '',
      capacity: vehicle?.capacity != null ? String(vehicle.capacity) : '',
      device_id: vehicle?.device_id ?? '',
      name: vehicle?.name ?? '',
      make: vehicle?.make ?? '',
      model: vehicle?.model ?? '',
      year: vehicle?.year != null ? String(vehicle.year) : '',
      vin: vehicle?.vin ?? '',
      license_plate: vehicle?.license_plate ?? '',
      status: (vehicle?.status as 'active' | 'maintenance' | 'retired') ?? 'active',
    },
  })

  async function onSubmit(data: FormValues) {
    try {
      const parsedYear = data.year ? parseInt(data.year, 10) : null
      const parsedCapacity = data.capacity ? parseInt(data.capacity, 10) : null
      const payload: Partial<Vehicle> = {
        number: data.number,
        capacity: parsedCapacity != null && !isNaN(parsedCapacity) ? parsedCapacity : null,
        device_id: data.device_id || null,
        name: data.name || data.number,
        make: data.make || null,
        model: data.model || null,
        year: parsedYear != null && !isNaN(parsedYear) ? parsedYear : null,
        vin: data.vin || null,
        license_plate: data.license_plate || null,
        status: data.status,
      }

      if (mode === 'create') {
        await api.vehicles.create(payload)
        router.push('/dashboard/vehicles')
      } else if (vehicle) {
        await api.vehicles.update(vehicle.id, payload)
        router.push(`/dashboard/vehicles/${vehicle.id}`)
      }
    } catch {
      alert('Failed to save vehicle.')
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-brand-navy)' }}>
          {mode === 'create' ? 'New Vehicle' : 'Edit Vehicle'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="number" className="block text-sm font-medium text-gray-700 mb-1">
                Bus Number <span className="text-red-500">*</span>
              </label>
              <input
                id="number"
                {...register('number')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="12"
              />
              {errors.number && <p className="mt-1 text-xs text-red-500">{errors.number.message}</p>}
            </div>
            <div>
              <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 mb-1">
                Capacity
              </label>
              <input
                id="capacity"
                {...register('capacity')}
                type="number"
                min={1}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="72"
              />
            </div>
          </div>

          <div>
            <label htmlFor="device_id" className="block text-sm font-medium text-gray-700 mb-1">
              Assigned Device
            </label>
            <select
              id="device_id"
              {...register('device_id')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition bg-white"
            >
              <option value="">No device assigned</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.serial}
                </option>
              ))}
            </select>
          </div>

          <details className="group">
            <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 mb-3 list-none flex items-center gap-1">
              <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
              Advanced details
            </summary>
            <div className="space-y-4 mt-3">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="name"
                  {...register('name')}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  placeholder="Bus 12"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <input
                    id="year"
                    {...register('year')}
                    type="number"
                    min={1900}
                    max={2100}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder="2023"
                  />
                </div>
                <div>
                  <label htmlFor="make" className="block text-sm font-medium text-gray-700 mb-1">
                    Make
                  </label>
                  <input
                    id="make"
                    {...register('make')}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder="Blue Bird"
                  />
                </div>
                <div>
                  <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
                    Model
                  </label>
                  <input
                    id="model"
                    {...register('model')}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder="Vision"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-1">
                    VIN
                  </label>
                  <input
                    id="vin"
                    {...register('vin')}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition uppercase"
                    placeholder="1HGBH41JXMN109186"
                    maxLength={17}
                  />
                </div>
                <div>
                  <label htmlFor="license_plate" className="block text-sm font-medium text-gray-700 mb-1">
                    License Plate
                  </label>
                  <input
                    id="license_plate"
                    {...register('license_plate')}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder="ABC-1234"
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
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </select>
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
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Vehicle' : 'Save Changes'}
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
