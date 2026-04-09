"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"

const segmentLabels: Record<string, string> = {
  admin: "Admin",
  audit: "Audit",
  billing: "Billing",
  dashboard: "Dashboard",
  demo: "Demo",
  drivers: "Drivers",
  help: "Help",
  management: "Management",
  "planner-runs": "Planner Runs",
  routes: "Routes",
  school: "School",
  settings: "Settings",
  stops: "Stops",
  student: "Student",
  students: "Students",
  "student-management": "Student Management",
  support: "Support",
  testing: "Testing",
  updates: "Updates",
  users: "Users",
  vehicles: "Vehicles",
  veichles: "Vehicles",
  orgs: "Organizations",
}

function formatSegment(segment: string) {
  return (
    segmentLabels[segment] ??
    decodeURIComponent(segment)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const dashboardIndex = segments.indexOf("dashboard")
  const breadcrumbSegments =
    dashboardIndex >= 0 ? segments.slice(dashboardIndex) : ["dashboard"]

  return (
    <header className="flex h-(--header-height) shrink-0 items-center border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbSegments.map((segment, index) => {
              const href = `/${breadcrumbSegments.slice(0, index + 1).join("/")}`
              const isLast = index === breadcrumbSegments.length - 1
              const label = formatSegment(segment)

              return (
                <Fragment key={href}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={href}>{label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
