"use client"

import {
  IconDashboard,
  IconBuildings,
  IconUsers,
  IconSettings,
} from "@tabler/icons-react"
import type { MeResponse } from "@/lib/api"
import { NavMain, type NavItem } from "@/components/dashboard/nav-main"
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
  SidebarRail,
} from "@/components/ui/sidebar"

const platformNav: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  { title: "Organizations", url: "/dashboard/organizations", icon: IconBuildings },
  { title: "Users", url: "/dashboard/users", icon: IconUsers },
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: IconSettings,
    items: [
      { title: "Platform", url: "/dashboard/settings/platform" },
      { title: "Billing", url: "/dashboard/settings/billing" },
      { title: "SSO", url: "/dashboard/settings/sso" },
    ],
  },
]

const districtNav: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
]

export function AppSidebar({ me, ...props }: React.ComponentProps<typeof Sidebar> & { me: MeResponse }) {
  const navItems = me.active_org.is_platform ? platformNav : districtNav

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[slot=sidebar-menu-button]:p-2!"
            >
              <a href="/dashboard">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="RouteGuard" className="size-7 shrink-0" />
                <span className="text-lg font-semibold">RouteGuard</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrgSwitcher currentOrg={me.active_org} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={me.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
