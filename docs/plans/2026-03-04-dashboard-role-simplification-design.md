# Dashboard Role Simplification Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

School district orgs use RouteGuard across four distinct roles with very different
workflows: School Admin, Dispatcher, Routing Specialist, and Fleet Manager. The current
dashboard presents all 9 nav items and a generic 5-card count overview to everyone,
regardless of role. This is overwhelming and makes it hard for users to identify what
they need to do.

## Goals

- Surface role-relevant content on the overview page for each persona
- Let district admins create curated roles for their staff in one click
- Allow admins with global permissions to preview any persona's view
- No new API endpoints, no DB migrations, no new user fields

## Out of Scope

- Per-role layouts or separate URL sections per role
- Automatic role assignment at invite time
- Mobile/driver PWA changes

---

## Architecture

Two self-contained changes:

1. **Preset role templates** in Settings > Roles
2. **Role-aware overview page** with an admin view switcher

Nav filtering is already permission-driven. Once a user is assigned a preset role, the
correct nav items appear automatically with no additional work.

---

## Part 1: Preset Role Templates

### Location

`components/dashboard/roles-management.tsx` - new "Preset roles" section rendered above
the existing "Create Role" button.

### Presets

| Role | Permissions |
|------|-------------|
| School Admin | `trips:read`, `students:read`, `routes:read`, `reports:read` |
| Dispatcher | `trips:read`, `trips:write`, `routes:read`, `drivers:read`, `vehicles:read` |
| Routing Specialist | `routes:read`, `routes:write`, `students:read`, `students:write`, `schools:read`, `schools:write`, `drivers:read`, `vehicles:read` |
| Fleet Manager | `vehicles:read`, `vehicles:write`, `drivers:read`, `reports:read` |

### Behavior

- Each preset renders as a card showing the role name, a short description, and an
  "Add to org" button
- Clicking "Add to org" calls `api.settings.roles.create()` with the preset name and
  permissions
- If a role with the same name already exists in the org, the button is replaced with
  an "Already added" disabled state (checked by name match against the loaded roles list)
- Created roles appear in the existing "Custom Roles" list and are fully editable

---

## Part 2: Role-Aware Overview Page

### Persona Detection

Detected server-side in `app/dashboard/page.tsx` after calling `getServerUser()`.
Detection is based on `user.permissions`:

| Condition | Persona |
|-----------|---------|
| Has `org:manage` | `admin` |
| Has `routes:write` AND `students:write` | `routing_specialist` |
| Has `trips:write` AND NOT `routes:write` | `dispatcher` |
| Has `vehicles:write` AND NOT `trips:write` AND NOT `routes:write` | `fleet_manager` |
| All other cases | `school_admin` |

### View Override (Admin Switcher)

- If `user.permissions` includes `org:manage` AND the `?view=` search param is a valid
  persona key, the requested persona overrides the detected one
- Valid values: `admin`, `school_admin`, `dispatcher`, `routing_specialist`, `fleet_manager`

### PersonaViewSwitcher Component

A new client component (`components/dashboard/persona-view-switcher.tsx`) rendered at
the top-right of the overview page header row, **only when user has `org:manage`**.

- Renders a shadcn `Select` with all 5 persona options
- Current view is the active selection
- On change, calls `router.push('/dashboard?view=<persona>')`
- When the active persona differs from the user's natural persona, shows a muted
  "Viewing as: [Role]" label beneath the select

### Per-Persona Overview Content

**Admin** (unchanged)
- 5-card grid: Routes, Students, Drivers, Vehicles, Schools counts

**School Admin**
- Stat cards: Active Trips (status = `in_progress`), Today's Trips (date = today),
  Students
- Quick links: Trips, Students, Reports

**Dispatcher**
- Stat cards: Active Trips, Scheduled Today
- Compact trip list: today's trips (up to 5), each row showing date, route assignment
  prefix, status badge - links to trip detail
- Quick link: Trips (with "New Trip" button)

**Routing Specialist**
- Stat cards: Routes, Students, Schools
- Quick links: Routes, Students, Schools

**Fleet Manager**
- Stat cards: Vehicles, Drivers
- Quick links: Vehicles, Drivers

### Data Fetching

Each persona fetches only the data it needs. Dispatcher fetches trips and filters to
today's date client-side (trips list is already fetched for the stat count). Other
personas fetch only the counts they display. No new API calls beyond what already exists.

---

## Files Changed

| File | Change |
|------|--------|
| `components/dashboard/roles-management.tsx` | Add preset roles section |
| `app/dashboard/page.tsx` | Persona detection, role-aware rendering, pass `searchParams` |
| `components/dashboard/persona-view-switcher.tsx` | New client component |

---

## Success Criteria

- A Dispatcher logging in sees only trips-relevant nav items and a trip-focused overview
- A Fleet Manager sees only vehicles/drivers nav and fleet-focused overview
- A district admin can go to Settings > Roles and create all 4 preset roles in under
  a minute
- An org admin can switch the overview to any persona view via the dropdown
