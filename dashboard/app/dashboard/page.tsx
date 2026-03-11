import { getServerUser } from "@/lib/server-api"
import { redirect } from "next/navigation"
import { PlatformDashboard } from "@/components/dashboard/platform-dashboard"
import { DistrictDashboard } from "@/components/dashboard/district-dashboard"

export default async function DashboardPage() {
  const me = await getServerUser()
  if (!me) redirect("/login")

  if (me.active_org.is_platform) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Platform Overview</h1>
        <PlatformDashboard />
      </div>
    )
  }

  return <DistrictDashboard />
}
