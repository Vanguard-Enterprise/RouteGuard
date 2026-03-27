import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { StopManagementPage } from "@/components/dashboard/stop-management-page"

export default async function StopManagementRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <StopManagementPage />
}
