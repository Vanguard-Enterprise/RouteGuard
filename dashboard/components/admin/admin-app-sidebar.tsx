import * as React from 'react'

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
import { AdminNavMain } from '@/components/admin/admin-nav-main'
import { AdminNavUser } from '@/components/admin/admin-nav-user'

interface AdminAppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: User
}

export function AdminAppSidebar({ user, ...props }: AdminAppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <a href="/admin/organizations">
                <span className="text-base font-semibold">RouteGuard</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <AdminNavMain />
      </SidebarContent>
      <SidebarFooter>
        <AdminNavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
