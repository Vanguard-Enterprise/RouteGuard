'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Tablet, ScrollText, type LucideIcon } from 'lucide-react'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const navItems: { title: string; url: string; icon: LucideIcon }[] = [
  { title: 'Organizations', url: '/admin/organizations', icon: Building2 },
  { title: 'Devices', url: '/admin/devices', icon: Tablet },
  { title: 'Audit Logs', url: '/admin/audit-logs', icon: ScrollText },
]

export function AdminNavMain() {
  const pathname = usePathname()

  return (
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
  )
}
