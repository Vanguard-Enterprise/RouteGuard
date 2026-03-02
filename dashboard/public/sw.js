const CACHE_NAME = 'routeguard-driver-v1'
const APP_SHELL = ['/driver', '/driver/pre-trip']

// --- Install: cache app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

// --- Activate: clean up old caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// --- Fetch handler ---
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithQueue(request))
    return
  }

  // Cache-first for static assets
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Cache-first for app shell pages
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Default: network with cache fallback
  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}

async function networkFirstWithQueue(request) {
  // Only queue POST requests to trip endpoints on network failure
  const isTripsPost =
    request.method === 'POST' && new URL(request.url).pathname.startsWith('/api/v1/trips/')

  try {
    const response = await fetch(request.clone())
    return response
  } catch (err) {
    // Only queue on network error (not 4xx/5xx — those return a Response, not throw)
    if (isTripsPost) {
      try {
        const body = await request.text()
        await queueRequest(request.url, request.method, body)
      } catch {
        // If we can't read the body, skip queuing
      }
    }
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// --- IndexedDB helpers ---
const DB_NAME = 'routeguard-offline'
const DB_VERSION = 1
const STORE_NAME = 'offline-queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = (event) => resolve(event.target.result)
    req.onerror = (event) => reject(event.target.error)
  })
}

async function queueRequest(url, method, body) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add({ url, method, body, timestamp: Date.now() })
    req.onsuccess = () => resolve(req.result)
    req.onerror = (event) => reject(event.target.error)
  })
}

async function replayQueue() {
  const db = await openDB()
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = (event) => reject(event.target.error)
  })

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        body: item.body,
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        // Remove from queue: success or permanent client error
        await deleteQueueItem(db, item.id)
      }
      // Leave in queue on 5xx to retry later
    } catch {
      // Still offline — leave item in queue
    }
  }
}

function deleteQueueItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = (event) => reject(event.target.error)
  })
}

// --- Background Sync ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-queue') {
    event.waitUntil(replayQueue())
  }
})

// --- Online event fallback for environments without Background Sync ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ONLINE') {
    replayQueue()
  }
})

// Listen for online events forwarded from clients
self.addEventListener('online', () => {
  replayQueue()
})
