'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const SEGMENT_LABELS: Record<string, string> = {
  routes: 'Routes',
  trips: 'Trips',
  students: 'Students',
  drivers: 'Drivers',
  vehicles: 'Vehicles',
  devices: 'Devices',
  schools: 'Schools',
  reports: 'Reports',
  settings: 'Settings',
  users: 'Users',
  roles: 'Roles',
  'api-keys': 'API Keys',
  sso: 'SSO',
  new: 'New',
  edit: 'Edit',
  attendance: 'Attendance',
  ridership: 'Ridership',
  performance: 'Performance',
  claim: 'Claim',
  provision: 'Provision',
  import: 'Import',
}

function isUuid(segment: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
}

export function DashboardBreadcrumb() {
  const pathname = usePathname()

  const segments = pathname
    .replace(/^\/dashboard\/?/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return null
  }

  const crumbs: { label: string; href: string }[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = isUuid(seg) ? 'Detail' : (SEGMENT_LABELS[seg] ?? seg)
    const href = '/dashboard/' + segments.slice(0, i + 1).join('/')
    crumbs.push({ label, href })
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map(({ label, href }, i) => (
          <React.Fragment key={href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={href}>{label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
