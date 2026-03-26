import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"
import { StudentManagementPage } from "@/components/dashboard/student-management-page"

export default async function StudentManagementRoute() {
  const me = await getServerUser()
  if (!me) {
    redirect("/login")
  }
  if (me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <StudentManagementPage />
}
