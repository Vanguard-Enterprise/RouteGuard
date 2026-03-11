"use client"

import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { MeResponse } from "@/lib/api"

export function ImpersonationBanner({ me }: { me: MeResponse }) {
  const router = useRouter()
  const isImpersonating = me.home_org_id !== me.active_org.id

  if (!isImpersonating) return null

  const handleReturn = async () => {
    await api.auth.switchOrg(me.home_org_id)
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="bg-brand-amber text-black px-4 py-2 text-sm font-medium flex items-center justify-between">
      <span>Viewing as {me.active_org.name}</span>
      <button
        onClick={handleReturn}
        className="underline hover:no-underline font-semibold"
      >
        Return to platform
      </button>
    </div>
  )
}
