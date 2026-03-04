import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { type User } from '@/lib/api'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { DashboardNavMain } from '@/components/dashboard/dashboard-nav-main'
import { DashboardNavUser } from '@/components/dashboard/dashboard-nav-user'

interface DashboardAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: User
}

export function DashboardAppSidebar({ user, ...props }: DashboardAppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/dashboard">
                <Image src="/logo.png" alt="RouteGuard" width={28} height={28} className="shrink-0" />
                <span className="text-base font-semibold">RouteGuard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <DashboardNavMain user={user} />
      </SidebarContent>
      <SidebarFooter>
        <DashboardNavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
