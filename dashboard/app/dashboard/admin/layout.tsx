import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/server-api"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const me = await getServerUser()

  if (!me || !me.active_org.is_platform) {
    redirect("/forbidden")
  }

  return <>{children}</>
}
