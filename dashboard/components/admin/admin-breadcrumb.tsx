'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const SEGMENT_LABELS: Record<string, string> = {
  organizations: 'Organizations',
  devices: 'Devices',
  'audit-logs': 'Audit Logs',
  new: 'New',
  edit: 'Edit',
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

  const crumbs: string[] = []
  for (const seg of segments) {
    if (isUuid(seg)) {
      crumbs.push('Detail')
    } else {
      crumbs.push(SEGMENT_LABELS[seg] ?? seg)
    }
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((label, i) => (
          <React.Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              <span
                className={
                  i === crumbs.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                }
              >
                {label}
              </span>
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
