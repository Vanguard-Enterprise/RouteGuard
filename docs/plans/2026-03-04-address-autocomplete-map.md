# Address Autocomplete and Map Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Mapbox address autocomplete to student and school forms, and display a map on their detail pages.

**Architecture:** A shared `AddressAutocomplete` component hits the Mapbox Geocoding API and fills city/state/zip on selection. Detail pages get small client-side map components - schools use stored lat/lng directly, students geocode the address on mount.

**Tech Stack:** Next.js 15 App Router, Mapbox GL JS (already installed), Mapbox Geocoding REST API, React Hook Form, TypeScript

---

### Task 1: AddressAutocomplete component

**Files:**
- Create: `dashboard/components/dashboard/address-autocomplete.tsx`

**Step 1: Create the component**

```tsx
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
      // short_code is "US-CA" — strip country prefix
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
```

**Step 2: Verify it compiles**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors in `address-autocomplete.tsx`

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/address-autocomplete.tsx
git commit -m "feat: add AddressAutocomplete component with Mapbox geocoding"
```

---

### Task 2: Wire AddressAutocomplete into student-form

**Files:**
- Modify: `dashboard/components/dashboard/student-form.tsx`

The form currently uses `useForm` directly. `AddressAutocomplete` uses `useFormContext`, so the form must switch to `FormProvider`.

**Step 1: Update student-form.tsx**

Replace the import block and form setup. Full diff:

1. Add imports at the top:
```tsx
import { useForm, FormProvider } from 'react-hook-form'
import AddressAutocomplete from '@/components/dashboard/address-autocomplete'
```
(change `useForm` import to also include `FormProvider`)

2. After `const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>(...)`, add:
```tsx
const methods = useForm<FormValues>({ ... })
const { register, handleSubmit, formState: { errors, isSubmitting } } = methods
```

Actually, replace the entire destructure with:
```tsx
const methods = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: {
    first_name: student?.first_name ?? '',
    last_name: student?.last_name ?? '',
    school_id: student?.school_id ?? '',
    student_number: student?.student_number ?? '',
    grade: student?.grade ?? '',
    status: (student?.status as 'active' | 'inactive') ?? 'active',
    address: student?.address ?? '',
    city: student?.city ?? '',
    state: student?.state ?? '',
    zip: student?.zip ?? '',
    medical_notes: student?.medical_notes ?? '',
    rfid_tag_id: '',
  },
})
const { register, handleSubmit, formState: { errors, isSubmitting } } = methods
```

3. Wrap the return's `<div className="max-w-lg">` with `<FormProvider {...methods}>`:
```tsx
return (
  <FormProvider {...methods}>
    <div className="max-w-lg">
      ...
    </div>
  </FormProvider>
)
```

4. Replace the address `<input>` block (the one with `{...register('address')}`) with:
```tsx
<div>
  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
    Address
  </label>
  <AddressAutocomplete name="address" />
</div>
```

The city/state/zip inputs below stay as-is - they'll be auto-filled by the component via `setValue`.

**Step 2: Verify**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

Expected: no errors

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/student-form.tsx
git commit -m "feat: use AddressAutocomplete in student form"
```

---

### Task 3: Wire AddressAutocomplete into school-form

**Files:**
- Modify: `dashboard/components/dashboard/school-form.tsx`

Same pattern as Task 2. Schools also have `lat`/`lng` fields, so pass `fillLatLng`.

**Step 1: Update school-form.tsx**

1. Update import:
```tsx
import { useForm, FormProvider } from 'react-hook-form'
import AddressAutocomplete from '@/components/dashboard/address-autocomplete'
```

2. Replace `const { register, ... } = useForm(...)` with `const methods = useForm(...)` then destructure from `methods`.

3. Wrap return JSX in `<FormProvider {...methods}>`.

4. Replace the address `<input>` block with:
```tsx
<div>
  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
    Address
  </label>
  <AddressAutocomplete name="address" fillLatLng />
</div>
```

The lat/lng inputs will still render below for manual override - they'll just be auto-populated.

**Step 2: Verify**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/school-form.tsx
git commit -m "feat: use AddressAutocomplete in school form, auto-fill lat/lng"
```

---

### Task 4: StudentAddressMap component

**Files:**
- Create: `dashboard/components/dashboard/student-address-map.tsx`

Geocodes a full address string on mount, shows a Mapbox map with a pin. Renders nothing if address is empty or geocoding fails.

**Step 1: Create the component**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface StudentAddressMapProps {
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

export default function StudentAddressMap({ address, city, state, zip }: StudentAddressMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [coords, setCoords] = useState<[number, number] | null>(null)

  const fullAddress = [address, city, state, zip].filter(Boolean).join(', ')

  useEffect(() => {
    if (!fullAddress) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${token}&limit=1`,
    )
      .then((r) => r.json())
      .then((data) => {
        const feature = data.features?.[0]
        if (feature) {
          setCoords([feature.geometry.coordinates[0], feature.geometry.coordinates[1]])
        }
      })
      .catch(() => {})
  }, [fullAddress])

  useEffect(() => {
    if (!coords || !containerRef.current) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: coords,
      zoom: 14,
    })
    new mapboxgl.Marker().setLngLat(coords).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [coords])

  if (!fullAddress) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50">
        <span className="text-sm font-medium text-gray-700">Location</span>
      </div>
      <div ref={containerRef} className="w-full h-48" />
    </div>
  )
}
```

**Step 2: Verify**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/student-address-map.tsx
git commit -m "feat: add StudentAddressMap component with on-demand geocoding"
```

---

### Task 5: SchoolAddressMap component

**Files:**
- Create: `dashboard/components/dashboard/school-address-map.tsx`

Schools store lat/lng - no geocoding needed.

**Step 1: Create the component**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

interface SchoolAddressMapProps {
  lat: number
  lng: number
}

export default function SchoolAddressMap({ lat, lng }: SchoolAddressMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 14,
    })
    new mapboxgl.Marker().setLngLat([lng, lat]).addTo(map)
    return () => map.remove()
  }, [lat, lng])

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-50">
        <span className="text-sm font-medium text-gray-700">Location</span>
      </div>
      <div ref={containerRef} className="w-full h-48" />
    </div>
  )
}
```

**Step 2: Verify**

```bash
cd dashboard && npm run build 2>&1 | tail -20
```

**Step 3: Commit**

```bash
git add dashboard/components/dashboard/school-address-map.tsx
git commit -m "feat: add SchoolAddressMap component"
```

---

### Task 6: Wire maps into detail pages

**Files:**
- Modify: `dashboard/app/dashboard/students/[id]/page.tsx`
- Modify: `dashboard/app/dashboard/schools/[id]/page.tsx`

**Step 1: Update student detail page**

Add import at top:
```tsx
import StudentAddressMap from '@/components/dashboard/student-address-map'
```

After the closing `</div>` of the fields card (and after `<StudentGuardians ...>`), add:
```tsx
<StudentAddressMap
  address={student.address}
  city={student.city}
  state={student.state}
  zip={student.zip}
/>
```

Actually, place it between the fields card and `StudentGuardians` so it flows: info -> map -> guardians.

**Step 2: Update school detail page**

Add import:
```tsx
import SchoolAddressMap from '@/components/dashboard/school-address-map'
```

After the closing `</div>` of the fields card, add conditionally:
```tsx
{school.lat != null && school.lng != null && (
  <SchoolAddressMap lat={school.lat} lng={school.lng} />
)}
```

**Step 3: Verify build and lint**

```bash
cd dashboard && npm run lint && npm run build
```

Expected: 0 errors

**Step 4: Commit**

```bash
git add dashboard/app/dashboard/students/[id]/page.tsx dashboard/app/dashboard/schools/[id]/page.tsx
git commit -m "feat: show address map on student and school detail pages"
```

---

## Manual Test Checklist

- [ ] Go to new/edit student - type a partial address in the Address field - suggestions appear
- [ ] Select a suggestion - city, state, zip fill automatically
- [ ] Go to new/edit school - same autocomplete behavior, lat/lng also fill
- [ ] View a student with a full address - map appears below fields with a pin
- [ ] View a student with no address - map section is absent
- [ ] View a school with lat/lng - map appears with pin
- [ ] View a school without lat/lng - map section is absent
