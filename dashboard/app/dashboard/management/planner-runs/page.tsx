import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { PlannerRunsHistoryPage } from "@/components/dashboard/planner-runs-history-page"

export default async function PlannerRunsRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <PlannerRunsHistoryPage />
}
