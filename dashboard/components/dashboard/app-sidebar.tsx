"use client"

import * as React from "react"
import type { MeResponse } from "@/lib/api"
import { NavMain } from "@/components/dashboard/nav-main"
import { NavSecondary } from "@/components/dashboard/nav-secondary"
import { NavUser } from "@/components/dashboard/nav-user"
import { OrgSwitcher } from "@/components/dashboard/org-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  BusIcon,
  UsersIcon,
  MapPinIcon,
  ChartBarIcon,
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
  {
    title: "Stops",
    url: "/dashboard/stops",
    icon: <MapPinIcon />,
  },
  {
    title: "Analytics",
    url: "/dashboard/analytics",
    icon: <ChartBarIcon />,
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

const secondaryNavItems = [
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: <Settings2Icon />,
  },
  {
    title: "Get Help",
    url: "/dashboard/help",
    icon: <CircleHelpIcon />,
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
  const navItems = me.active_org.is_platform
    ? platformNavItems
    : districtNavItems

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="/dashboard">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="RouteGuard"
                  className="size-5!"
                />
                <span className="text-base font-semibold">RouteGuard</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrgSwitcher currentOrg={me.active_org} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <NavSecondary items={secondaryNavItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={me.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
