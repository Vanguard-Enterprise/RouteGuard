import { redirect } from "next/navigation"
import { GuardianManagementPage } from "@/components/dashboard/guardian-management-page"
import { getServerUser } from "@/lib/server-api"

export default async function GuardianManagementRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }
  if (!me.permissions.includes("org:manage")) {
    redirect("/forbidden")
  }

  return <GuardianManagementPage />
}
