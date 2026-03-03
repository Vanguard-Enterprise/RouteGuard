'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Tablet, ScrollText, Users, Shield, type LucideIcon } from 'lucide-react'

import { type User } from '@/lib/api'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const navItems: { title: string; url: string; icon: LucideIcon }[] = [
  { title: 'Organizations', url: '/admin/organizations', icon: Building2 },
  { title: 'Devices', url: '/admin/devices', icon: Tablet },
  { title: 'Audit Logs', url: '/admin/audit-logs', icon: ScrollText },
]

const staffNavItems: { title: string; url: string; icon: LucideIcon }[] = [
  { title: 'Users', url: '/admin/staff/users', icon: Users },
  { title: 'Roles', url: '/admin/staff/roles', icon: Shield },
]

interface Props {
  user: User
}

export function AdminNavMain({ user }: Props) {
  const pathname = usePathname()
  const hasStaffManage = user.permissions?.includes('staff:manage') ?? false

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = pathname === item.url || pathname.startsWith(item.url + '/')
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {hasStaffManage && (
        <SidebarGroup>
          <SidebarGroupLabel>Staff</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {staffNavItems.map((item) => {
                const isActive = pathname === item.url || pathname.startsWith(item.url + '/')
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  )
}
