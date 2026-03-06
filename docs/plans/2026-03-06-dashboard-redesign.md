# Dashboard Redesign - shadcn dashboard-01

Date: 2026-03-06

## Overview

Replace the current minimal header-based dashboard layout with the shadcn dashboard-01 block pattern. Single `/dashboard` route that adapts based on the user's role (site admin vs district user), determined by `active_org.is_platform` from `/auth/me`.

## Layout

- Collapsible sidebar (`SidebarProvider` + `SidebarInset`)
- Site header with breadcrumbs
- Org switcher integrated into sidebar (replaces current header dropdown)
- Content area with section cards, interactive chart, and data table

## Sidebar Nav

### Site Admin (`is_platform: true`)

- Dashboard (home)
- Organizations
- Users
- Settings (expandable)
  - Platform config
  - Billing
  - SSO

### District User (`is_platform: false`)

- Dashboard (only item for now - more added later)

## Dashboard Page Content (both roles)

All placeholder/demo data for initial build:

- 4 metric summary cards (section cards)
- Interactive area chart (shadcn v4 charts)
- Data table with sorting/filtering

## Technical Details

### Role Detection

The `/auth/me` endpoint returns `MeResponse` which includes:
- `active_org.is_platform` - boolean flag for site admin vs district
- `permissions[]` - string array for fine-grained RBAC

The sidebar and page content conditionally render based on `is_platform`.

### Dependencies (from dashboard-01 block)

- `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `@tabler/icons-react`
- `@tanstack/react-table`
- `zod` (already installed)

### Existing Components

- `sidebar.tsx` UI component already installed
- `org-switcher.tsx` exists, will be adapted for sidebar placement

### Files to Create/Modify

- `app/dashboard/layout.tsx` - replace header layout with sidebar layout
- `app/dashboard/page.tsx` - add section cards, chart, data table
- `components/dashboard/app-sidebar.tsx` - sidebar with role-based nav
- `components/dashboard/site-header.tsx` - top header with breadcrumbs
- `components/dashboard/section-cards.tsx` - metric cards
- `components/dashboard/chart-area-interactive.tsx` - area chart
- `components/dashboard/data-table.tsx` - data table
- `components/dashboard/nav-main.tsx` - main nav items
- `components/dashboard/nav-secondary.tsx` - secondary nav items (if needed)
- `components/dashboard/org-switcher.tsx` - adapt for sidebar
