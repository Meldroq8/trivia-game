// Service Worker for PWA, Firebase Storage Image Caching, and Auto-Updates
const STATIC_CACHE_NAME = 'lamma-static-v2'
const IMAGE_CACHE_NAME = 'firebase-images-v1'
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes

let currentVersion = null

// Static assets to cache for offline support
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
]

// Files that should NEVER be cached (always fetch fresh)
const NO_CACHE_FILES = [
  '/version.json'
]

// Helper function to check if URL is video or audio (avoid CORS issues)
function isVideoOrAudio(url) {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv']
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']
  const allExtensions = [...videoExtensions, ...audioExtensions]

  return allExtensions.some(ext => url.toLowerCase().includes(ext)) ||
         url.includes('question_video_') ||
         url.includes('answer_video_') ||
         url.includes('question_audio_') ||
         url.includes('answer_audio_')
}

// Check if URL is from image storage (Firebase or S3)
function isImageStorageUrl(url) {
  return url.includes('firebasestorage.googleapis.com') ||
         url.includes('.s3.amazonaws.com') ||
         url.includes('s3.amazonaws.com')
}

// Check if URL should never be cached
function shouldNeverCache(url) {
  return NO_CACHE_FILES.some(file => url.endsWith(file))
}

// Check for new version and update cache if needed
async function checkForUpdates() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    if (!response.ok) return

    const data = await response.json()
    const newVersion = data.version

    if (currentVersion === null) {
      // First load - store current version
      currentVersion = newVersion
      console.log('[SW] Initial version:', currentVersion)
    } else if (currentVersion !== newVersion) {
      // Version changed - clear caches and update
      console.log('[SW] New version detected:', newVersion, '(was:', currentVersion, ')')
      currentVersion = newVersion

      // Clear static cache to force fresh fetch
      const cache = await caches.open(STATIC_CACHE_NAME)
      const keys = await cache.keys()
      await Promise.all(keys.map(key => cache.delete(key)))

      console.log('[SW] Cache cleared, new assets will be fetched on next navigation')

      // Notify all clients that update is ready
      const clients = await self.clients.matchAll()
      clients.forEach(client => {
        client.postMessage({ type: 'VERSION_UPDATED', version: newVersion })
      })
    }
  } catch (error) {
    // Silent fail - network might be unavailable
  }
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE_NAME)
      await cache.addAll(STATIC_ASSETS)

      // Get initial version
      try {
        const response = await fetch('/version.json', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          currentVersion = data.version
          console.log('[SW] Installed with version:', currentVersion)
        }
      } catch (e) {
        // Ignore - version check will happen later
      }
    })()
  )
  // Activate immediately - don't wait for old SW to stop
  self.skipWaiting()
})

// Activate event - clean up old caches and start version checking
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames.map(cacheName => {
          // Keep current caches, delete old versions
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )

      // Start periodic version checking
      setInterval(checkForUpdates, VERSION_CHECK_INTERVAL)

      console.log('[SW] Activated and controlling all clients')
    })()
  )
  // Take control of all pages immediately
  self.clients.claim()
})

// Message handler for manual update check and skip waiting
self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_VERSION') {
    checkForUpdates()
  }
  // Allow client to trigger skip waiting
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // NEVER cache version.json - always fetch fresh
  if (shouldNeverCache(event.request.url)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }))
    return
  }

  // Handle Firebase Storage and S3 images (exclude video/audio to avoid CORS issues)
  if (isImageStorageUrl(event.request.url) && !isVideoOrAudio(event.request.url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // Check if cached version exists and is not expired
          if (response) {
            const cachedDate = new Date(response.headers.get('sw-cached-date'))
            if (Date.now() - cachedDate.getTime() < CACHE_EXPIRY) {
              return response
            }
          }

          // Fetch from network and cache
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone()

              // Add cache timestamp
              const headers = new Headers(responseClone.headers)
              headers.set('sw-cached-date', new Date().toISOString())

              const cachedResponse = new Response(responseClone.body, {
                status: responseClone.status,
                statusText: responseClone.statusText,
                headers: headers
              })

              cache.put(event.request, cachedResponse)
            }

            return networkResponse
          }).catch(() => {
            // Return cached version if network fails
            return response
          })
        })
      })
    )
    return
  }

  // Handle same-origin requests - Network first, then cache
  // This ensures fresh content while still supporting offline
  if (url.origin === location.origin) {
    // Skip hot module replacement and dev server stuff
    if (url.pathname.startsWith('/__') || url.pathname.includes('hot-update')) return

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses for offline use
          const responseToCache = response.clone()
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
          return response
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // Return offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html')
            }
            return new Response('Offline', { status: 503 })
          })
        })
    )
  }
})

// Note: visibilitychange doesn't work in service workers
// Version checking is handled via periodic checks and client-side events
