'use client'

import { useState } from 'react'
import type { User } from '@/lib/api'
import { api } from '@/lib/api'

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

const PIN_LENGTH_OPTIONS = [4, 5, 6, 7, 8]

interface OrgSettingsFormProps {
  user: User
  orgName?: string | null
  pinLength?: number
}

export default function OrgSettingsForm({ orgName, pinLength = 4 }: OrgSettingsFormProps) {
  const [selectedPinLength, setSelectedPinLength] = useState(pinLength)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSaveKiosk = async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await api.settings.org.updateSettings({ pin_length: selectedPinLength })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Failed to save kiosk settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-brand-navy)' }}>
          Organization Settings
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          Organization details - update via the API or contact your administrator.
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

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-brand-navy)' }}>
          Kiosk Settings
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          Configure how the driver kiosk behaves on provisioned devices.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Driver PIN Length
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Number of digits required for driver PIN authentication (4-8).
            </p>
            <select
              value={selectedPinLength}
              onChange={(e) => setSelectedPinLength(Number(e.target.value))}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            >
              {PIN_LENGTH_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} digits
                </option>
              ))}
            </select>
          </div>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              Kiosk settings saved.
            </p>
          )}

          <button
            onClick={handleSaveKiosk}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            {saving ? 'Saving...' : 'Save Kiosk Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
