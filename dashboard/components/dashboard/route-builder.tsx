'use client'

import { useState, useRef } from 'react'
import { GripVertical, Trash2, Plus, MapPin } from 'lucide-react'
import { api, Stop } from '@/lib/api'
import MapView from '@/components/map/map-view'

interface RouteBuilderProps {
  routeId: string
  initialStops: Stop[]
}

interface StopFormState {
  name: string
  address: string
  lat: string
  lng: string
  scheduled_time: string
}

const EMPTY_FORM: StopFormState = {
  name: '',
  address: '',
  lat: '',
  lng: '',
  scheduled_time: '',
}

export default function RouteBuilder({ routeId, initialStops }: RouteBuilderProps) {
  const [stops, setStops] = useState<Stop[]>(
    [...initialStops].sort((a, b) => a.sequence_order - b.sequence_order),
  )
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<StopFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const dragIndex = useRef<number | null>(null)

  function handleDragStart(idx: number) {
    dragIndex.current = idx
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIndex.current === null || dragIndex.current === idx) return
  }

  async function handleDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault()
    const fromIdx = dragIndex.current
    if (fromIdx === null || fromIdx === dropIdx) return
    dragIndex.current = null

    const reordered = [...stops]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(dropIdx, 0, moved)

    const updated = reordered.map((s, i) => ({ ...s, sequence_order: i + 1 }))
    setStops(updated)

    for (const s of updated) {
      if (s.sequence_order !== stops.find((orig) => orig.id === s.id)?.sequence_order) {
        try {
          await api.routes.stops.update(routeId, s.id, { sequence_order: s.sequence_order })
        } catch {
          // best-effort
        }
      }
    }
  }

  async function handleDeleteStop(stopId: string) {
    try {
      await api.routes.stops.delete(routeId, stopId)
      setStops((prev) =>
        prev
          .filter((s) => s.id !== stopId)
          .map((s, i) => ({ ...s, sequence_order: i + 1 })),
      )
    } catch {
      alert('Failed to delete stop.')
    }
  }

  async function handleAddStop() {
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Stop name is required.')
      return
    }
    setSaving(true)
    try {
      const parsedLat = form.lat ? parseFloat(form.lat) : null
      const parsedLng = form.lng ? parseFloat(form.lng) : null
      const newStop = await api.routes.stops.create(routeId, {
        name: form.name.trim(),
        address: form.address || null,
        lat: parsedLat !== null && !isNaN(parsedLat) ? parsedLat : null,
        lng: parsedLng !== null && !isNaN(parsedLng) ? parsedLng : null,
        sequence_order: stops.length + 1,
        scheduled_time: form.scheduled_time || null,
      })
      setStops((prev) => [...prev, newStop])
      setForm(EMPTY_FORM)
      setShowAddForm(false)
    } catch {
      setFormError('Failed to add stop.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-brand-navy)' }}>
        Route Builder
      </h3>
      <div className="flex gap-4 h-[520px]">
        <div className="w-72 flex flex-col gap-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Stops ({stops.length})
            </span>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-brand-navy)' }}
            >
              <Plus size={13} />
              Add Stop
            </button>
          </div>

          {showAddForm && (
            <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">New Stop</p>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400 transition"
                  placeholder="Oak St & Main"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400 transition"
                  placeholder="123 Oak St"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Latitude</label>
                  <input
                    value={form.lat}
                    onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                    type="number"
                    step="any"
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400 transition"
                    placeholder="37.77"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Longitude</label>
                  <input
                    value={form.lng}
                    onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                    type="number"
                    step="any"
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400 transition"
                    placeholder="-122.42"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Scheduled Time</label>
                <input
                  value={form.scheduled_time}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))}
                  type="time"
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400 transition"
                />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddStop}
                  disabled={saving}
                  className="flex-1 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: 'var(--color-brand-navy)' }}
                >
                  {saving ? 'Saving…' : 'Add'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setForm(EMPTY_FORM)
                    setFormError(null)
                  }}
                  className="flex-1 py-1.5 rounded text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {stops.length === 0 && !showAddForm && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
              <MapPin size={24} className="mb-2 opacity-50" />
              <p className="text-xs">No stops yet. Add one to begin.</p>
            </div>
          )}

          <div className="space-y-1.5">
            {stops.map((stop, idx) => (
              <div
                key={stop.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-2 cursor-grab active:cursor-grabbing hover:border-gray-300 transition-colors group"
              >
                <GripVertical size={14} className="text-gray-400 shrink-0" />
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: 'var(--color-brand-navy)' }}
                >
                  {stop.sequence_order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{stop.name}</p>
                  {stop.address && (
                    <p className="text-xs text-gray-500 truncate">{stop.address}</p>
                  )}
                  {stop.scheduled_time && (
                    <p className="text-xs text-gray-400">{stop.scheduled_time}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteStop(stop.id)}
                  className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete stop"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-xl overflow-hidden border border-gray-200">
          <MapView stops={stops} />
        </div>
      </div>
    </div>
  )
}
