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
  overview: 'Overview',
  organizations: 'Organizations',
  devices: 'Devices',
  'audit-logs': 'Audit Logs',
  staff: 'Staff',
  users: 'Users',
  roles: 'Roles',
  new: 'New',
  edit: 'Edit',
  profile: 'Profile',
}

function isUuid(segment: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
}

export function AdminBreadcrumb() {
  const pathname = usePathname()

  // Strip /admin prefix and split
  const segments = pathname
    .replace(/^\/admin\/?/, '')
    .split('/')
    .filter(Boolean)

  if (segments.length === 0) {
    return null
  }

  const crumbs: { label: string; href: string }[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = isUuid(seg) ? 'Detail' : (SEGMENT_LABELS[seg] ?? seg)
    const href = '/admin/' + segments.slice(0, i + 1).join('/')
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
