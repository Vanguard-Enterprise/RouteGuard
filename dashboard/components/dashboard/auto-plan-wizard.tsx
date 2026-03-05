'use client'

import { useState } from 'react'
import { api, type AutoPlanResponse } from '@/lib/api'
import AutoPlanMap from '@/components/dashboard/auto-plan-map'

type Step = 'configure' | 'review' | 'confirming' | 'done'

interface AutoPlanWizardProps {
  onClose: () => void
  onConfirmed: (tripIds: string[]) => void
}

export default function AutoPlanWizard({ onClose, onConfirmed }: AutoPlanWizardProps) {
  const [step, setStep] = useState<Step>('configure')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<'morning' | 'afternoon' | 'midday'>('morning')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<AutoPlanResponse | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.trips.autoplan(date, type)
      if (result.buses.length === 0) {
        setError('No active students with addresses found. Add student addresses first.')
        return
      }
      setPlan(result)
      setStep('review')
    } catch {
      setError('Failed to generate plan. Check that buses and students are configured.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(finalPlan: AutoPlanResponse) {
    setStep('confirming')
    try {
      const result = await api.trips.autoPlanConfirm({ date, type, buses: finalPlan.buses })
      onConfirmed(result.trips.map((t) => t.id))
      setStep('done')
    } catch {
      setError('Failed to save the plan. Please try again.')
      setStep('review')
    }
  }

  if (step === 'done') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-md text-center">
        <p className="text-sm font-semibold text-green-700 mb-2">Trips created successfully</p>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    )
  }

  if ((step === 'review' || step === 'confirming') && plan) {
    return (
      <AutoPlanMap
        plan={plan}
        onConfirm={handleConfirm}
        onBack={() => setStep('configure')}
        confirming={step === 'confirming'}
      />
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-md">
      <h3 className="text-base font-semibold text-gray-800 mb-4">Plan Trips</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Run Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(['morning', 'afternoon', 'midday'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`py-2 rounded-md text-sm font-medium border transition-colors capitalize ${
                  type === t
                    ? 'text-white border-transparent'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={type === t ? { backgroundColor: 'var(--color-brand-navy)' } : {}}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand-navy)' }}
          >
            {loading ? 'Generating...' : 'Auto-Plan'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
