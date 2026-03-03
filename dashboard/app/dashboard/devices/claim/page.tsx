'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, APIError } from '@/lib/api'
import { toast } from 'sonner'

const codeSchema = z.object({
  claim_code: z.string().length(8, 'Claim code must be 8 characters').toUpperCase(),
})

const vehicleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  number: z.string().optional(),
  license_plate: z.string().optional(),
  capacity: z.string().optional(),
  year: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
})

type CodeForm = z.infer<typeof codeSchema>
type VehicleForm = z.infer<typeof vehicleSchema>

export default function ClaimDevicePage() {
  const router = useRouter()
  const [step, setStep] = useState<'code' | 'vehicle'>('code')
  const [claimCode, setClaimCode] = useState('')

  const codeForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })
  const vehicleForm = useForm<VehicleForm>({ resolver: zodResolver(vehicleSchema) })

  async function onCodeSubmit(data: CodeForm) {
    setClaimCode(data.claim_code)
    setStep('vehicle')
  }

  async function onVehicleSubmit(data: VehicleForm) {
    const capacity = data.capacity ? parseInt(data.capacity, 10) : undefined
    const year = data.year ? parseInt(data.year, 10) : undefined
    try {
      await api.devices.claim({
        claim_code: claimCode,
        vehicle: {
          name: data.name,
          number: data.number || undefined,
          license_plate: data.license_plate || undefined,
          capacity: capacity && !isNaN(capacity) ? capacity : undefined,
          year: year && !isNaN(year) ? year : undefined,
          make: data.make || undefined,
          model: data.model || undefined,
        },
      })
      toast.success('Device added to your fleet')
      router.push('/dashboard/devices')
      router.refresh()
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Failed to add device'
      if (err instanceof APIError && (err.status === 404 || err.status === 410)) {
        toast.error('Claim code expired or not found. Reboot the device for a new code.')
        setStep('code')
        return
      }
      toast.error(msg)
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        Add Device
      </h1>

      <div className="flex items-center gap-2 mb-6">
        {(['code', 'vehicle'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step === s
                  ? 'text-white'
                  : i < (['code', 'vehicle'] as const).indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-400'
              }`}
              style={step === s ? { backgroundColor: 'var(--color-brand-navy)' } : {}}
            >
              {i + 1}
            </div>
            <span className="text-sm text-gray-500">{s === 'code' ? 'Claim Code' : 'Bus Info'}</span>
            {i < 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        {step === 'code' && (
          <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
            <p className="text-sm text-gray-500">
              Power on the RouteGuard device. A claim code will appear on the device screen.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim Code
              </label>
              <input
                {...codeForm.register('claim_code')}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono uppercase outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                placeholder="XXXXXXXX"
                maxLength={8}
                autoComplete="off"
              />
              {codeForm.formState.errors.claim_code && (
                <p className="mt-1 text-xs text-red-500">{codeForm.formState.errors.claim_code.message}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              Next
            </button>
          </form>
        )}

        {step === 'vehicle' && (
          <form onSubmit={vehicleForm.handleSubmit(onVehicleSubmit)} className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter the details for the bus this device is installed in.
            </p>
            {(
              [
                { id: 'name', label: 'Bus Name', required: true, placeholder: 'Bus 12', type: 'text' },
                { id: 'number', label: 'Bus Number', placeholder: '12', type: 'text' },
                { id: 'license_plate', label: 'License Plate', placeholder: 'ABC-1234', type: 'text' },
                { id: 'capacity', label: 'Capacity', placeholder: '48', type: 'number' },
                { id: 'year', label: 'Year', placeholder: '2021', type: 'number' },
                { id: 'make', label: 'Make', placeholder: 'Blue Bird', type: 'text' },
                { id: 'model', label: 'Model', placeholder: 'All American', type: 'text' },
              ] as { id: keyof VehicleForm; label: string; required?: boolean; placeholder: string; type: string }[]
            ).map(({ id, label, required, placeholder, type }) => (
              <div key={id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  {...vehicleForm.register(id as keyof VehicleForm)}
                  type={type ?? 'text'}
                  placeholder={placeholder}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                {vehicleForm.formState.errors[id as keyof VehicleForm] && (
                  <p className="mt-1 text-xs text-red-500">
                    {vehicleForm.formState.errors[id as keyof VehicleForm]?.message}
                  </p>
                )}
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep('code')}
                className="px-5 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={vehicleForm.formState.isSubmitting}
                className="flex-1 px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-brand-navy)' }}
              >
                {vehicleForm.formState.isSubmitting ? 'Adding...' : 'Add Device'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
