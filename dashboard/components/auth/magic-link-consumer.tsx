"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle } from "lucide-react"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function MagicLinkConsumer() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const missingToken = !token
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (missingToken) {
      return
    }

    const magicToken = token
    let cancelled = false

    async function consume() {
      try {
        await api.auth.consumeMagicLink(magicToken)
        if (!cancelled) {
          router.replace("/dashboard")
        }
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "This magic link is invalid or expired."
        setError(message)
      }
    }

    consume()

    return () => {
      cancelled = true
    }
  }, [missingToken, router, token])

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{error || missingToken ? "Magic link unavailable" : "Signing you in"}</CardTitle>
          <CardDescription>
            {error || missingToken ? "Request a fresh link or sign in with your password." : "One moment while we open your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          {error || missingToken ? (
            <>
              <p className="text-sm text-destructive">{error ?? "This magic link is missing a token."}</p>
              <Button asChild>
                <Link href="/login">Back to login</Link>
              </Button>
            </>
          ) : (
            <>
              <LoaderCircle className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Validating your link and creating a secure session.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
