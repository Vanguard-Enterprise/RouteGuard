import { api, APIError } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'

async function getDevice(id: string) {
  try {
    return await api.devices.get(id)
  } catch (err) {
    if (err instanceof APIError && err.status === 401) redirect('/staff/login')
    if (err instanceof APIError && err.status === 404) notFound()
    throw err
  }
}

export const metadata = { title: 'Device - RouteGuard' }

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const device = await getDevice(id)

  const fields = [
    { label: 'Serial', value: device.serial },
    { label: 'Status', value: device.status },
    { label: 'Vehicle ID', value: device.vehicle_id ?? '-' },
    { label: 'Seat Count', value: device.seat_count?.toString() ?? '-' },
    {
      label: 'Provisioned',
      value: device.provisioned_at
        ? new Date(device.provisioned_at).toLocaleString()
        : '-',
    },
    { label: 'Created', value: new Date(device.created_at).toLocaleString() },
  ]

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-brand-navy)' }}>
        Device
      </h1>

      {device.status === 'unclaimed' && device.claim_code && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Waiting to be claimed</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Claim code: <span className="font-mono font-bold">{device.claim_code}</span>
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm font-medium text-gray-900 font-mono">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
