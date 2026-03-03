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
              <Link href="/admin/organizations">
                <Image src="/logo.png" alt="RouteGuard" width={28} height={28} className="shrink-0" />
                <span className="text-base font-semibold">RouteGuard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <AdminNavMain user={user} />
      </SidebarContent>
      <SidebarFooter>
        <AdminNavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
