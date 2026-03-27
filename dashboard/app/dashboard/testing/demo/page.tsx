import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { DriverBusDemoPage } from "@/components/dashboard/driver-bus-demo-page"

export default async function DriverDemoRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <DriverBusDemoPage />
}
