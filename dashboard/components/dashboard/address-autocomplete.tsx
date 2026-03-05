'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'

interface Suggestion {
  place_name: string
  text: string
  address?: string
  geometry: { coordinates: [number, number] }
  context?: { id: string; text: string; short_code?: string }[]
}

interface AddressAutocompleteProps {
  /** react-hook-form field name for the street address */
  name: string
  /** If true, also sets lat/lng fields when a suggestion is selected */
  fillLatLng?: boolean
}

export default function AddressAutocomplete({ name, fillLatLng = false }: AddressAutocompleteProps) {
  const { register, setValue, watch } = useFormContext()
  const value = watch(name) as string
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value || value.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${token}&autocomplete=true&types=address&limit=5&country=us`,
        )
        const data = await res.json()
        setSuggestions(data.features ?? [])
        setOpen((data.features ?? []).length > 0)
      } catch {
        // silently ignore
      }
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(s: Suggestion) {
    const street = s.address ? `${s.address} ${s.text}` : s.text
    setValue(name, street, { shouldDirty: true })

    const ctx = s.context ?? []
    const place = ctx.find((c) => c.id.startsWith('place.'))
    const region = ctx.find((c) => c.id.startsWith('region.'))
    const postcode = ctx.find((c) => c.id.startsWith('postcode.'))

    if (place) setValue('city', place.text, { shouldDirty: true })
    if (region) {
      // short_code is "US-CA" - strip country prefix
      const abbr = region.short_code?.split('-')[1] ?? region.text.slice(0, 2).toUpperCase()
      setValue('state', abbr, { shouldDirty: true })
    }
    if (postcode) setValue('zip', postcode.text, { shouldDirty: true })

    if (fillLatLng) {
      setValue('lat', String(s.geometry.coordinates[1]), { shouldDirty: true })
      setValue('lng', String(s.geometry.coordinates[0]), { shouldDirty: true })
    }

    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        {...register(name)}
        autoComplete="off"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
        placeholder="123 Main St"
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg text-sm overflow-hidden">
          {suggestions.map((s) => (
            <li
              key={s.place_name}
              className="px-3 py-2 hover:bg-gray-50 cursor-pointer truncate"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
            >
              {s.place_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
