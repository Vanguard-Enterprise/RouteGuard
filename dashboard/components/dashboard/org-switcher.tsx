"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
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
import useSWR from "swr"

export function OrgSwitcher({ currentOrg }: { currentOrg: OrgOption }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isMobile } = useSidebar()
  const [loading, setLoading] = useState(false)
  const hasHydratedOrgs = useRef(false)
  const knownOrgIds = useRef<Set<string>>(new Set([currentOrg.id]))

  const { data: orgsData, mutate } = useSWR<OrgOption[]>(
    ["auth-orgs"],
    () => api.auth.orgs(),
    {
      fallbackData: [currentOrg],
      refreshInterval: 5000,
      revalidateOnFocus: true,
      onSuccess: (nextOrgs) => {
        const nextOrgIds = new Set(nextOrgs.map((org) => org.id))

        if (!hasHydratedOrgs.current) {
          knownOrgIds.current = nextOrgIds
          hasHydratedOrgs.current = true
          return
        }

        const newlyAddedOrgs = nextOrgs.filter((org) => !knownOrgIds.current.has(org.id))
        for (const org of newlyAddedOrgs) {
          toast.success(`You were added to ${org.name}.`)
        }

        knownOrgIds.current = nextOrgIds
      },
    }
  )

  useEffect(() => {
    mutate().catch(() => {})
  }, [mutate, pathname])

  const orgs = orgsData ?? [currentOrg]

  async function handleSwitch(orgId: string) {
    if (orgId === currentOrg.id) return
    setLoading(true)
    try {
      const result = await api.auth.switchOrg(orgId)
      const switchedToPlatform = result.org.is_platform

      if (!switchedToPlatform && pathname.startsWith("/dashboard/admin")) {
        router.push("/dashboard")
      }

      await mutate()
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
          <SidebarMenuButton size="lg" className="cursor-default">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <IconBuilding className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{currentOrg.name}</span>
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
