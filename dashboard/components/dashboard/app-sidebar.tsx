"use client"

import * as React from "react"
import Link from "next/link"
import type { MeResponse } from "@/lib/api"
import { NavMain } from "@/components/dashboard/nav-main"
import { NavSecondary } from "@/components/dashboard/nav-secondary"
import { NavUser } from "@/components/dashboard/nav-user"
import { OrgSwitcher } from "@/components/dashboard/org-switcher"
import { LogoIcon } from "@/components/logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  BusIcon,
  UsersIcon,
  BuildingIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
} from "lucide-react"

const platformNavItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon />,
  },
]

const districtNavItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon />,
  },
  {
    title: "Routes",
    url: "/dashboard/routes",
    icon: <BusIcon />,
  },
  {
    title: "Students",
    url: "/dashboard/students",
    icon: <UsersIcon />,
  },
]

const districtManagementNavItems = [
  {
    title: "Student",
    url: "/dashboard/management/student",
    icon: <UsersIcon />,
  },
  {
    title: "Guardian",
    url: "/dashboard/management/guardian",
    icon: <UsersIcon />,
  },
  {
    title: "School",
    url: "/dashboard/management/school",
    icon: <BuildingIcon />,
  },
  {
    title: "Vehicles",
    url: "/dashboard/management/vehicles",
    icon: <BusIcon />,
  },
  {
    title: "Drivers",
    url: "/dashboard/management/drivers",
    icon: <UsersIcon />,
  },
  {
    title: "Stops",
    url: "/dashboard/management/stops",
    icon: <BusIcon />,
  },
  {
    title: "Planner Runs",
    url: "/dashboard/management/planner-runs",
    icon: <LayoutDashboardIcon />,
  },
]

const testingNavItems = [
  {
    title: "Demo",
    url: "/dashboard/testing/demo",
    icon: <BusIcon />,
  },
]

const secondaryNavItems = [
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: <Settings2Icon />,
  },
  {
    title: "Search",
    url: "#",
    icon: <SearchIcon />,
  },
]

export function AppSidebar({
  me,
  ...props
}: React.ComponentProps<typeof Sidebar> & { me: MeResponse }) {
  const isImpersonating = me.home_org_id !== me.active_org.id
  const isPlatform = me.active_org.is_platform

  const navItems = isPlatform && !isImpersonating
    ? platformNavItems
    : districtNavItems
  const effectiveSecondaryNavItems = isPlatform && !isImpersonating
    ? secondaryNavItems
    : [
      secondaryNavItems[0],
      {
        title: "Get Help",
        url: "/dashboard/help",
        icon: <CircleHelpIcon />,
      },
      secondaryNavItems[1],
    ]

  const showManagement = !isPlatform || isImpersonating
  const showTesting = !isPlatform || isImpersonating
  const managementItems = districtManagementNavItems.filter((item) => {
    if (item.url === "/dashboard/management/student") {
      return me.permissions.includes("org:manage")
    }
    if (item.url === "/dashboard/management/guardian") {
      return me.permissions.includes("org:manage")
    }
    if (item.url === "/dashboard/management/school") {
      return me.permissions.includes("org:manage")
    }
    if (item.url === "/dashboard/management/vehicles") {
      return me.permissions.includes("vehicles:read")
    }
    if (item.url === "/dashboard/management/drivers") {
      return me.permissions.includes("drivers:read")
    }
    if (item.url === "/dashboard/management/stops") {
      return me.permissions.includes("stops:read")
    }
    if (item.url === "/dashboard/management/planner-runs") {
      return me.permissions.includes("planning:run")
    }
    return true
  })

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard">
                <LogoIcon className="size-5!" sizes="20px" />
                <span className="text-base font-semibold">RouteGuard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrgSwitcher currentOrg={me.active_org} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        {showManagement && managementItems.length > 0 ? (
          <NavMain title="Management" items={managementItems} />
        ) : null}
        {showTesting ? (
          <NavMain title="Testing" items={testingNavItems} />
        ) : null}
        <NavSecondary items={effectiveSecondaryNavItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={me.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
