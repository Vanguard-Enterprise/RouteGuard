"use client"

import {
  IconDashboard,
  IconBuildings,
  IconUsers,
  IconSettings,
} from "@tabler/icons-react"
import type { MeResponse } from "@/lib/api"
import { NavMain, type NavItem } from "@/components/dashboard/nav-main"
import { OrgSwitcher } from "@/components/dashboard/org-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
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
        <OrgSwitcher currentOrg={me.active_org} userName={me.user.name} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
