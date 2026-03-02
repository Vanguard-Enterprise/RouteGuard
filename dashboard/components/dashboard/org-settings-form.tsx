'use client'

import type { User } from '@/lib/api'

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Phoenix',
  'America/Indiana/Indianapolis',
  'America/Detroit',
  'UTC',
]

interface OrgSettingsFormProps {
  user: User
  orgName?: string | null
}

export default function OrgSettingsForm({ user, orgName }: OrgSettingsFormProps) {
  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-brand-navy)' }}>
          Organization Settings
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          Organization details — update via the API or contact your administrator.
        </p>

        <div className="space-y-4 opacity-70 pointer-events-none select-none">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name
            </label>
            <input
              readOnly
              value={orgName ?? '(not available)'}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-gray-50 outline-none cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              disabled
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-gray-50 outline-none cursor-not-allowed"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input
              readOnly
              value=""
              placeholder="https://example.com/logo.png"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-gray-50 outline-none cursor-not-allowed"
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          Organization update endpoint is not yet available. Settings are read-only.
        </p>
      </div>
    </div>
  )
}
