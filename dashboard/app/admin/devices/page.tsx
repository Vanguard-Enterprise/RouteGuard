import { api, APIError } from '@/lib/api'
import { redirect } from 'next/navigation'
import DeviceTable from '@/components/admin/device-table'

async function getDevices() {
  try {
    return await api.admin.devices.list()
  } catch (err) {
    if (err instanceof APIError && err.status === 401) {
      redirect('/staff/login')
    }
    return []
  }
}

export const metadata = {
  title: 'Devices — RouteGuard Admin',
}

export default async function DevicesPage() {
  const devices = await getDevices()

  return (
    <div>
      <DeviceTable devices={devices} />
    </div>
  )
}
