import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { DriverManagementPage } from "@/components/dashboard/driver-management-page"

export default async function DriverManagementRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <DriverManagementPage />
}
