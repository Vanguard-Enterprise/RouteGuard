import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { VehicleManagementPage } from "@/components/dashboard/vehicle-management-page"

export default async function VehicleManagementRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }
  if (!me.permissions.includes("vehicles:read")) {
    redirect("/forbidden")
  }

  return <VehicleManagementPage />
}
