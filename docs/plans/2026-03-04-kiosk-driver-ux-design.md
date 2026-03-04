# Kiosk Driver UX - Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

The driver kiosk experience has two major issues:

1. The pre-trip screen forces drivers to manually type a raw route assignment ID (a UUID-like string). Drivers do not know this value and there is no keyboard on the kiosk. The API already auto-discovers the active assignment from the device+driver pair, so the input is redundant.

2. The visual design is inconsistent and unpolished compared to the RouteGuard marketing homepage. Screens use raw inline styles and floating elements without the card-based, navy-anchored aesthetic established by the public site.

There is also no logout button on the pre-trip screen, so a driver who authenticates cannot sign out without rebooting.

## Changes

### Backend - New endpoint

#### `GET /api/v1/trips/assignment` (trip-session auth)

Returns the driver's active route assignment preview without creating a trip. Uses the same `FindActiveAssignment` logic as `StartTrip`.

Response `200 OK`:
```json
{
  "route_name": "AM Route 7",
  "route_type": "pickup",
  "stop_count": 12,
  "vehicle_name": "Bus 12",
  "date": "2026-03-04"
}
```

Response `404 Not Found` if no active assignment exists for the driver+vehicle+org today.

Wired as: `GET /api/v1/trips/assignment` under `tripSessionAuth` middleware.

### Frontend

#### Lock screen (`components/driver/lock-screen.tsx`)

- Larger RouteGuard wordmark in amber with cleaner vertical layout
- PIN dots and number grid rendered inside a dark card panel (`#152D47`) with rounded corners and subtle border
- "or tap your RFID badge" hint remains below the card

#### Pre-trip page (`app/driver/pre-trip/page.tsx` + `components/driver/route-summary.tsx`)

- On mount, fetch `GET /api/v1/trips/assignment` using the trip session token from `driver_session`
- Show a route card with: route name, vehicle name, stop count, today's date
- If the API returns 404: show a "No route assigned for today" state with a retry button
- Remove the manual route assignment ID text input entirely
- Add a logout button (top-right corner): clears `driver_session` from localStorage, redirects to `/driver`
- "Start Run" button sends `POST /api/v1/trips/start` with no request body
- On success: store the full returned manifest in `localStorage['trip_manifest']` so the active run stop list populates
- The `route-summary.tsx` component is rewritten to accept route preview data as props instead of a manual input

#### Active run (`components/driver/active-run.tsx`)

No functional changes. The manifest fix (saving on trip start) means stops now populate correctly without any changes to this component.

## Brand Tokens

- Navy: `#1B3A5C` (full-bleed backgrounds)
- Card: `#152D47` (content panels)
- Amber: `#F5A825` (headings, CTAs)
- Green: `#2A7D4F` (primary action buttons)
- Label text: `text-blue-300`
- Body text: `text-white`

## What Is Not Changing

- PIN pad component (`pin-pad.tsx`) - already works well, minor style polish only
- Active run screen logic - no functional changes
- Scan feedback overlay - no changes
- Backend auth flow - no changes
