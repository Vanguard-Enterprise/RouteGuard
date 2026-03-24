import { Suspense } from "react"

import { MagicLinkConsumer } from "@/components/auth/magic-link-consumer"

export default function MagicLinkPage() {
  return (
    <Suspense fallback={null}>
      <MagicLinkConsumer />
    </Suspense>
  )
}
