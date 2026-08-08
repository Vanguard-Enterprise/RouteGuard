import { getDemoUser } from "@/lib/demo-session"
import { DistrictDashboard } from "@/components/dashboard/district-dashboard"

export default async function DashboardPage() {
  await getDemoUser()

  return <DistrictDashboard />
}
