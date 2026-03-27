import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit, getClientIp } from "@/app/api/geo/_lib/rate-limit"
import { getRedisClient } from "@/app/api/geo/_lib/redis"

export const runtime = "nodejs"

const MAPBOX_PROXY_RATE_LIMIT_PER_MINUTE = 240
const MAX_CACHE_TTL_SECONDS = 24 * 60 * 60
const DEFAULT_CACHE_TTL_SECONDS = 10 * 60

type CacheMeta = {
  contentType: string
  cacheControl: string
}

type LocalCacheEntry = {
  body: Buffer
  meta: CacheMeta
  expiresAt: number
}

const localCache = new Map<string, LocalCacheEntry>()

function cleanupLocalCache(now: number) {
  if (localCache.size < 500) return
  for (const [key, value] of localCache) {
    if (value.expiresAt <= now) localCache.delete(key)
  }
}

function isAllowedMapboxUrl(value: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (parsed.protocol !== "https:") return null
  if (!parsed.hostname.toLowerCase().endsWith("mapbox.com")) return null
  return parsed
}

function resolveServerToken(): string {
  return (
    process.env.MAPBOX_TOKEN?.trim() ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ??
    ""
  )
}

function parseTtlSeconds(cacheControl: string): number {
  const match = cacheControl.match(/(?:s-maxage|max-age)=(\d+)/i)
  if (!match) return DEFAULT_CACHE_TTL_SECONDS
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_TTL_SECONDS
  return Math.min(MAX_CACHE_TTL_SECONDS, parsed)
}

function cacheKeyForUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}

async function getCachedMapboxResponse(cacheKey: string): Promise<{ body: Buffer; meta: CacheMeta } | null> {
  const redis = getRedisClient()
  if (redis) {
    try {
      if (redis.status !== "ready") await redis.connect()
      const [metaRaw, bodyRaw] = await Promise.all([
        redis.get(`rg:mapbox:cache:meta:${cacheKey}`),
        redis.getBuffer(`rg:mapbox:cache:body:${cacheKey}`),
      ])
      if (!metaRaw || !bodyRaw) return null
      return { body: bodyRaw, meta: JSON.parse(metaRaw) as CacheMeta }
    } catch {
      // Fall back to local process cache when Redis is unavailable.
    }
  }

  const now = Date.now()
  cleanupLocalCache(now)
  const local = localCache.get(cacheKey)
  if (!local) return null
  if (local.expiresAt <= now) {
    localCache.delete(cacheKey)
    return null
  }
  return { body: local.body, meta: local.meta }
}

async function setCachedMapboxResponse(
  cacheKey: string,
  body: Buffer,
  meta: CacheMeta,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedisClient()
  if (redis) {
    try {
      if (redis.status !== "ready") await redis.connect()
      await Promise.all([
        redis.set(`rg:mapbox:cache:meta:${cacheKey}`, JSON.stringify(meta), "EX", Math.max(1, ttlSeconds)),
        redis.set(`rg:mapbox:cache:body:${cacheKey}`, body, "EX", Math.max(1, ttlSeconds)),
      ])
      return
    } catch {
      // Fall back to local process cache when Redis is unavailable.
    }
  }

  localCache.set(cacheKey, {
    body,
    meta,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
  })
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimit = await checkRateLimit(
    "mapbox-proxy",
    clientIp,
    MAPBOX_PROXY_RATE_LIMIT_PER_MINUTE,
    60_000
  )
  if (!rateLimit.allowed) {
    return new NextResponse("Rate limit exceeded", {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    })
  }

  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() ?? ""
  const upstreamUrl = isAllowedMapboxUrl(rawUrl)
  if (!upstreamUrl) {
    return new NextResponse("Invalid upstream url", { status: 400 })
  }

  const configuredToken = resolveServerToken()
  const urlToken = upstreamUrl.searchParams.get("access_token")?.trim() ?? ""
  const token = configuredToken || urlToken
  if (!token) {
    return new NextResponse("Mapbox token is not configured", { status: 503 })
  }

  upstreamUrl.searchParams.set("access_token", token)
  const upstreamUrlValue = upstreamUrl.toString()
  const cacheKey = cacheKeyForUrl(upstreamUrlValue)

  const cached = await getCachedMapboxResponse(cacheKey)
  if (cached) {
    return new NextResponse(new Uint8Array(cached.body), {
      status: 200,
      headers: {
        "Content-Type": cached.meta.contentType,
        "Cache-Control": cached.meta.cacheControl,
        "X-RouteGuard-Mapbox-Cache": "HIT",
      },
    })
  }

  const upstream = await fetch(upstreamUrlValue, {
    cache: "no-store",
    headers: {
      Accept: request.headers.get("accept") ?? "*/*",
    },
  })

  if (!upstream.ok) {
    return new NextResponse(await upstream.text(), { status: upstream.status })
  }

  const arrayBuffer = await upstream.arrayBuffer()
  const body = Buffer.from(arrayBuffer)
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream"
  const cacheControl = upstream.headers.get("cache-control") ?? `public, max-age=${DEFAULT_CACHE_TTL_SECONDS}`
  const ttlSeconds = parseTtlSeconds(cacheControl)

  await setCachedMapboxResponse(cacheKey, body, { contentType, cacheControl }, ttlSeconds)

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "X-RouteGuard-Mapbox-Cache": "MISS",
    },
  })
}
