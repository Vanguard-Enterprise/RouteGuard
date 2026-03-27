import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { RouteManagementPage } from "@/components/dashboard/route-management-page"

export default async function RoutesPage() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <RouteManagementPage />
}
