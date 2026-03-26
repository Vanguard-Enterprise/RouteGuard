import type { MeResponse } from "@/lib/api"

export function ImpersonationBanner({ me }: { me: MeResponse }) {
  void me
  return null
}
