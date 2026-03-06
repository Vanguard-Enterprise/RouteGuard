# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the minimal header-based dashboard with the shadcn dashboard-01 sidebar layout, adapting content based on user role (`is_platform` flag).

**Architecture:** Collapsible sidebar layout using `SidebarProvider` + `SidebarInset`. The server layout fetches `/auth/me` and passes `MeResponse` to client components. Sidebar nav items and dashboard content conditionally render based on `active_org.is_platform`. All dashboard data is placeholder for now.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (sidebar, chart, collapsible, breadcrumb), @tabler/icons-react, @tanstack/react-table, recharts, @dnd-kit

---

## Existing State

- `dashboard/components/ui/sidebar.tsx` - full shadcn sidebar component (installed)
- `dashboard/components/ui/breadcrumb.tsx` - installed
- `dashboard/hooks/use-mobile.ts` - installed
- `dashboard/components/dashboard/org-switcher.tsx` - dropdown-based, needs rewrite for sidebar
- `dashboard/app/dashboard/layout.tsx` - simple header layout, will be replaced
- `dashboard/app/dashboard/page.tsx` - placeholder, will be replaced
- `dashboard/lib/server-api.ts` - `getServerUser()` returns `MeResponse | null`
- `dashboard/lib/api.ts` - types: `MeResponse`, `OrgOption` (has `is_platform: boolean`)
- Brand sidebar vars already set in `globals.css`: navy bg (`#1B3A5C`), amber primary (`#F5A825`)
- `@tabler/icons-react` already installed

---

### Task 1: Install dependencies

**Files:**
- Modify: `dashboard/package.json`

**Step 1: Install npm packages**

Run from `dashboard/`:
```bash
npm install recharts @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities @tanstack/react-table zod
```

**Step 2: Add missing shadcn components (chart, collapsible)**

Run from `dashboard/`:
```bash
npx shadcn@latest add chart collapsible
```

This creates `components/ui/chart.tsx` and `components/ui/collapsible.tsx`.

**Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add package.json package-lock.json components/ui/chart.tsx components/ui/collapsible.tsx
git commit -m "feat: add chart, collapsible, recharts, dnd-kit, react-table deps"
```

---

### Task 2: Create nav-main component

**Files:**
- Create: `dashboard/components/dashboard/nav-main.tsx`

**Step 1: Create the component**

This renders the primary nav items in the sidebar. It uses `Collapsible` for expandable sections (like Settings). Each nav item has an icon, label, optional URL, and optional sub-items.

```tsx
"use client"

import { IconChevronRight, type Icon } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export interface NavItem {
  title: string
  url: string
  icon?: Icon
  items?: { title: string; url: string }[]
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) =>
            item.items && item.items.length > 0 ? (
              <Collapsible key={item.title} asChild defaultOpen={pathname.startsWith(item.url)}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                      <IconChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((sub) => (
                        <SidebarMenuSubItem key={sub.title}>
                          <SidebarMenuSubButton asChild isActive={pathname === sub.url}>
                            <Link href={sub.url}>
                              <span>{sub.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ) : (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/nav-main.tsx
git commit -m "feat: add nav-main sidebar component"
```

---

### Task 3: Rewrite org-switcher for sidebar

**Files:**
- Modify: `dashboard/components/dashboard/org-switcher.tsx`

**Step 1: Rewrite the component**

Replace the current dropdown-based org switcher with a sidebar-native version using `SidebarMenuButton` and `DropdownMenu`. Shows org name + user name in the sidebar header.

```tsx
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconSelector, IconBuilding } from "@tabler/icons-react"
import { api, type OrgOption } from "@/lib/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

interface OrgSwitcherProps {
  currentOrg: OrgOption
  userName: string
}

export function OrgSwitcher({ currentOrg, userName }: OrgSwitcherProps) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.auth.orgs().then(setOrgs).catch(() => {})
  }, [])

  async function handleSwitch(orgId: string) {
    if (orgId === currentOrg.id) return
    setLoading(true)
    try {
      await api.auth.switchOrg(orgId)
      router.refresh()
    } catch {
      toast.error("Failed to switch organization.")
    } finally {
      setLoading(false)
    }
  }

  if (orgs.length <= 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <IconBuilding className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{currentOrg.name}</span>
              <span className="truncate text-xs">{userName}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={loading}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <IconBuilding className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{currentOrg.name}</span>
                <span className="truncate text-xs">{userName}</span>
              </div>
              <IconSelector className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            {orgs.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleSwitch(org.id)}
                className={org.id === currentOrg.id ? "font-semibold" : ""}
              >
                <IconBuilding className="mr-2 size-4" />
                {org.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/org-switcher.tsx
git commit -m "feat: rewrite org-switcher for sidebar layout"
```

---

### Task 4: Create app-sidebar component

**Files:**
- Create: `dashboard/components/dashboard/app-sidebar.tsx`

**Step 1: Create the component**

The main sidebar that conditionally renders nav items based on `is_platform`. Receives the full `MeResponse` as a prop from the server layout.

```tsx
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
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/app-sidebar.tsx
git commit -m "feat: add app-sidebar with role-based nav"
```

---

### Task 5: Create site-header component

**Files:**
- Create: `dashboard/components/dashboard/site-header.tsx`

**Step 1: Create the component**

Top header bar inside `SidebarInset` with sidebar trigger and breadcrumbs.

```tsx
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard">RouteGuard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/site-header.tsx
git commit -m "feat: add site-header with breadcrumbs"
```

---

### Task 6: Create section-cards component

**Files:**
- Create: `dashboard/components/dashboard/section-cards.tsx`

**Step 1: Create the component**

Four metric cards with placeholder data. Uses `IconTrendingUp` / `IconTrendingDown` for trend indicators.

```tsx
import {
  IconTrendingUp,
  IconTrendingDown,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function SectionCards() {
  return (
    <div className="grid gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active Routes</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingUp className="size-3" />
            +12%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">24</div>
          <p className="text-xs text-muted-foreground">6 currently in transit</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Students</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingUp className="size-3" />
            +8%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">1,284</div>
          <p className="text-xs text-muted-foreground">Across all active routes</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">On-Time Rate</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingDown className="size-3" />
            -2%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">94.2%</div>
          <p className="text-xs text-muted-foreground">Last 30 days average</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
          <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
            <IconTrendingUp className="size-3" />
            +4%
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">18</div>
          <p className="text-xs text-muted-foreground">3 on break today</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/section-cards.tsx
git commit -m "feat: add section-cards with placeholder metrics"
```

---

### Task 7: Create chart-area-interactive component

**Files:**
- Create: `dashboard/components/dashboard/chart-area-interactive.tsx`

**Step 1: Create the component**

Interactive area chart with time range selector using shadcn chart + recharts. Placeholder ridership data.

```tsx
"use client"

import { useState, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useIsMobile } from "@/hooks/use-mobile"

// Generate 90 days of placeholder ridership data
const chartData = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(2026, 0, 1)
  date.setDate(date.getDate() + i)
  return {
    date: date.toISOString().split("T")[0],
    riders: Math.floor(Math.random() * 400 + 800),
    onTime: Math.floor(Math.random() * 50 + 750),
  }
})

const chartConfig = {
  riders: { label: "Total Riders", color: "var(--chart-1)" },
  onTime: { label: "On-Time", color: "var(--chart-2)" },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = useState("30d")

  const filtered = useMemo(() => {
    const now = new Date(2026, 2, 31)
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - days)
    return chartData.filter((d) => new Date(d.date) >= cutoff)
  }, [timeRange])

  return (
    <Card>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>Daily Ridership</CardTitle>
          <CardDescription>Riders scanned per day</CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40 rounded-lg" aria-label="Select time range">
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">Last 3 months</SelectItem>
            <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
            <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filtered}>
            <defs>
              <linearGradient id="fillRiders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-riders)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-riders)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillOnTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-onTime)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-onTime)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="onTime"
              type="natural"
              fill="url(#fillOnTime)"
              stroke="var(--color-onTime)"
              stackId="a"
            />
            <Area
              dataKey="riders"
              type="natural"
              fill="url(#fillRiders)"
              stroke="var(--color-riders)"
              stackId="b"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/chart-area-interactive.tsx
git commit -m "feat: add interactive area chart with placeholder ridership data"
```

---

### Task 8: Create data-table component

**Files:**
- Create: `dashboard/components/dashboard/data-table.tsx`

**Step 1: Create the component**

A sortable data table using @tanstack/react-table with placeholder route data. Simplified from dashboard-01 (no drag-and-drop columns for now - keeps it cleaner).

```tsx
"use client"

import { useState } from "react"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface RouteRow {
  id: string
  name: string
  status: "active" | "inactive" | "delayed"
  driver: string
  students: number
  stops: number
}

const data: RouteRow[] = [
  { id: "R-001", name: "North Elementary AM", status: "active", driver: "Sarah Johnson", students: 32, stops: 12 },
  { id: "R-002", name: "South Middle PM", status: "active", driver: "Mike Chen", students: 28, stops: 9 },
  { id: "R-003", name: "West High AM", status: "delayed", driver: "James Williams", students: 45, stops: 15 },
  { id: "R-004", name: "East Elementary PM", status: "active", driver: "Lisa Park", students: 22, stops: 8 },
  { id: "R-005", name: "Central Middle AM", status: "inactive", driver: "Tom Garcia", students: 38, stops: 11 },
  { id: "R-006", name: "North High PM", status: "active", driver: "Amy Rodriguez", students: 41, stops: 14 },
  { id: "R-007", name: "South Elementary AM", status: "active", driver: "David Kim", students: 26, stops: 10 },
  { id: "R-008", name: "West Middle PM", status: "delayed", driver: "Rachel Scott", students: 35, stops: 13 },
]

const statusVariant: Record<RouteRow["status"], "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  delayed: "destructive",
}

const columns: ColumnDef<RouteRow>[] = [
  { accessorKey: "id", header: "Route ID" },
  { accessorKey: "name", header: "Route Name" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as RouteRow["status"]
      return <Badge variant={statusVariant[status]}>{status}</Badge>
    },
  },
  { accessorKey: "driver", header: "Driver" },
  { accessorKey: "students", header: "Students" },
  { accessorKey: "stops", header: "Stops" },
]

export function DataTable() {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="px-4 lg:px-6">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No routes found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add components/dashboard/data-table.tsx
git commit -m "feat: add data-table with placeholder route data"
```

---

### Task 9: Rewrite dashboard layout and page

**Files:**
- Modify: `dashboard/app/dashboard/layout.tsx`
- Modify: `dashboard/app/dashboard/page.tsx`

**Step 1: Rewrite layout.tsx**

Replace the header-based layout with the sidebar layout. Pass `me` data to client components.

```tsx
import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { SiteHeader } from "@/components/dashboard/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await getServerUser()
  if (!me) redirect("/login")

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar me={me} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Rewrite page.tsx**

```tsx
import { SectionCards } from "@/components/dashboard/section-cards"
import { ChartAreaInteractive } from "@/components/dashboard/chart-area-interactive"
import { DataTable } from "@/components/dashboard/data-table"

export default function DashboardPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
        <DataTable />
      </div>
    </div>
  )
}
```

**Step 3: Run lint and build**

```bash
npm run lint
npm run build
```

Expected: Both pass with 0 errors.

**Step 4: Commit**

```bash
git add app/dashboard/layout.tsx app/dashboard/page.tsx
git commit -m "feat: rewrite dashboard with sidebar layout and placeholder content"
```

---

### Task 10: Visual verification

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Verify in browser**

- Navigate to `http://localhost:3000/dashboard`
- Confirm sidebar renders with navy background
- Confirm org switcher appears in sidebar header
- Confirm breadcrumbs in site header
- Confirm section cards, chart, and data table render
- Confirm sidebar collapses on toggle (Ctrl+B)
- Confirm mobile responsive (sheet drawer on small screens)

**Step 3: Final commit if any tweaks needed**
