import { NextRequest } from "next/server"
import { getRedisClient } from "./redis"

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
type CachedValue = {
  value: string
  expiresAt: number
}
const localCache = new Map<string, CachedValue>()

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 500) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded

  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  return "unknown"
}

export function checkRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return checkRateLimitInternal(scope, key, limit, windowMs)
}

async function checkRateLimitInternal(
  scope: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const redis = getRedisClient()
  if (redis) {
    try {
      if (redis.status !== "ready") {
        await redis.connect()
      }
      const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
      const bucketKey = `rg:geo:rl:${scope}:${key}`
      const count = await redis.incr(bucketKey)
      if (count === 1) {
        await redis.expire(bucketKey, windowSec)
      }
      if (count > limit) {
        const ttl = await redis.ttl(bucketKey)
        return { allowed: false, retryAfterSeconds: Math.max(1, ttl) }
      }
      return { allowed: true, retryAfterSeconds: 0 }
    } catch {
      // Fall through to local limiter when Redis is unavailable.
    }
  }

  const now = Date.now()
  cleanupExpiredBuckets(now)

  const bucketKey = `${scope}:${key}`
  const bucket = buckets.get(bucketKey)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    return { allowed: false, retryAfterSeconds }
  }

  bucket.count += 1
  buckets.set(bucketKey, bucket)
  return { allowed: true, retryAfterSeconds: 0 }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedisClient()
  if (redis) {
    try {
      if (redis.status !== "ready") {
        await redis.connect()
      }
      const raw = await redis.get(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      // Fall through to local cache when Redis is unavailable.
    }
  }

  const entry = localCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    localCache.delete(key)
    return null
  }
  return JSON.parse(entry.value) as T
}

export async function setCachedJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value)
  const redis = getRedisClient()
  if (redis) {
    try {
      if (redis.status !== "ready") {
        await redis.connect()
      }
      await redis.set(key, serialized, "EX", Math.max(1, ttlSeconds))
      return
    } catch {
      // Fall through to local cache when Redis is unavailable.
    }
  }

  localCache.set(key, {
    value: serialized,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
  })
}
