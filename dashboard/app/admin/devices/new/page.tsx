'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import ProvisionTokenModal from '@/components/admin/provision-token-modal'

const schema = z.object({
  serial: z.string().min(1, 'Serial number is required').max(100, 'Serial too long'),
})

type FormValues = z.infer<typeof schema>

export default function NewDevicePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [serial, setSerial] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormValues) {
    try {
      const result = await api.admin.devices.create({ serial: data.serial })
      setSerial(result.serial)
      setToken(result.provisioning_token)
    } catch {
      alert('Failed to create device. The serial number may already exist.')
    }
  }

  function handleModalClose() {
    setToken(null)
    router.push('/admin/devices')
    router.refresh()
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        Create Device
      </h1>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <p className="text-sm text-gray-500 mb-5">
          Register a new hardware device by entering its serial number. A provisioning token will be generated
          that allows the device to self-configure on first boot.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="serial" className="block text-sm font-medium text-gray-700 mb-1">
              Serial Number
            </label>
            <input
              id="serial"
              {...register('serial')}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              placeholder="RG-XXXX-XXXX"
              autoComplete="off"
            />
            {errors.serial && <p className="mt-1 text-xs text-red-500">{errors.serial.message}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              {isSubmitting ? 'Creating…' : 'Create Device'}
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

      {token && (
        <ProvisionTokenModal
          open={true}
          token={token}
          serial={serial}
          onClose={handleModalClose}
        />
      )}
    </div>
  )
}
