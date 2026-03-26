import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { SchoolManagementPage } from "@/components/dashboard/school-management-page"

export default async function SchoolManagementRoute() {
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

  return <SchoolManagementPage />
}
