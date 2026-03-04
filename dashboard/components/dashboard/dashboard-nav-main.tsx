'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Route,
  Bus,
  GraduationCap,
  UserCheck,
  Truck,
  Tablet,
  School,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import { type User } from '@/lib/api'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  permission: string | null
}

const navItems: NavItem[] = [
  { title: 'Overview',  url: '/dashboard',          icon: LayoutDashboard, permission: null },
  { title: 'Routes',    url: '/dashboard/routes',    icon: Route,           permission: 'routes:read' },
  { title: 'Trips',     url: '/dashboard/trips',     icon: Bus,             permission: 'trips:read' },
  { title: 'Students',  url: '/dashboard/students',  icon: GraduationCap,   permission: 'students:read' },
  { title: 'Drivers',   url: '/dashboard/drivers',   icon: UserCheck,       permission: 'drivers:read' },
  { title: 'Vehicles',  url: '/dashboard/vehicles',  icon: Truck,           permission: 'vehicles:read' },
  { title: 'Devices',   url: '/dashboard/devices',   icon: Tablet,          permission: 'devices:read' },
  { title: 'Schools',   url: '/dashboard/schools',   icon: School,          permission: 'schools:read' },
  { title: 'Reports',   url: '/dashboard/reports',   icon: BarChart3,       permission: 'reports:read' },
  { title: 'Settings',  url: '/dashboard/settings',  icon: Settings,        permission: 'org:manage' },
]

interface Props {
  user: User
}

export function DashboardNavMain({ user }: Props) {
  const pathname = usePathname()

  const visible = navItems.filter(
    (item) => item.permission === null || (user.permissions?.includes(item.permission) ?? false),
  )

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => {
            const isActive =
              item.url === '/dashboard'
                ? pathname === '/dashboard'
                : pathname === item.url || pathname.startsWith(item.url + '/')
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
