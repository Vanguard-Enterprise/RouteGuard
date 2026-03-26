import Redis from "ioredis"

let redisClient: Redis | null = null
let redisUnavailable = false

function buildRedisUrl(): string {
  const explicitUrl = process.env.REDIS_URL?.trim()
  if (explicitUrl) return explicitUrl

  const addr = process.env.REDIS_ADDR?.trim() || "127.0.0.1:63799"
  const [host, portRaw] = addr.includes(":") ? addr.split(":") : [addr, "6379"]
  const port = Number(portRaw || "6379")
  const password = process.env.REDIS_PASSWORD?.trim()

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`
  }
  return `redis://${host}:${port}`
}

export function getRedisClient(): Redis | null {
  if (redisUnavailable) return null
  if (redisClient) return redisClient

  try {
    redisClient = new Redis(buildRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
    })
    redisClient.on("error", () => {
      // Keep runtime resilient even if Redis becomes unavailable.
    })
    return redisClient
  } catch {
    redisUnavailable = true
    return null
  }
}
