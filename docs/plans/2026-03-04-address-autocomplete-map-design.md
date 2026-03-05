# Address Autocomplete and Map Display

## Summary

Two related improvements to address handling across the dashboard:
1. Address autocomplete on forms (students and schools) using Mapbox Geocoding
2. Map display on detail pages (students and schools) to visually confirm addresses

## Address Autocomplete

A shared `AddressAutocomplete` component replaces the plain address text input on both `student-form.tsx` and `school-form.tsx`. As the user types, it calls the Mapbox Geocoding API (`/geocoding/v5/mapbox.places`) and shows a dropdown of up to 5 address suggestions. Selecting a suggestion auto-fills the address, city, state, and zip fields via React Hook Form's `setValue`. The separate city/state/zip fields remain visible and editable for manual correction.

For schools, selecting a suggestion also auto-fills the lat/lng fields (already present in the school schema) from the suggestion's geometry coordinates.

The component is a controlled input that manages its own dropdown open/close state, debounces requests (300ms), and closes on outside click or Escape. It uses the existing `NEXT_PUBLIC_MAPBOX_TOKEN`.

## Map on Detail Pages

### Student detail (`/dashboard/students/[id]`)

A new `StudentAddressMap` client component is added below the fields card. It receives the student's address, city, state, and zip as props, constructs a full address string, and geocodes it via Mapbox on mount. If geocoding succeeds, it renders a Mapbox map (height ~200px) with a single pin. If the student has no address or geocoding fails, the component renders nothing.

### School detail (`/dashboard/schools/[id]`)

A new `SchoolAddressMap` client component is added below the fields card. Schools already store lat/lng, so no geocoding is needed - the map renders directly from stored coords. Only renders if lat and lng are non-null.

Both map components reuse the existing Mapbox GL setup pattern from `components/map/map-view.tsx`.

## Files Changed

- `components/dashboard/address-autocomplete.tsx` - new shared component
- `components/dashboard/student-form.tsx` - use AddressAutocomplete for address field
- `components/dashboard/school-form.tsx` - use AddressAutocomplete for address field, also fill lat/lng on select
- `components/dashboard/student-address-map.tsx` - new client component
- `components/dashboard/school-address-map.tsx` - new client component
- `app/dashboard/students/[id]/page.tsx` - add StudentAddressMap
- `app/dashboard/schools/[id]/page.tsx` - add SchoolAddressMap
