// Service Worker for PWA and Firebase Storage Image Caching
const STATIC_CACHE_NAME = 'lamma-static-v1'
const IMAGE_CACHE_NAME = 'firebase-images-v1'
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days

// Static assets to cache for offline support
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
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

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  // Activate immediately
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Keep current caches, delete old versions
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  // Take control of all pages immediately
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Handle Firebase Storage images (exclude video/audio to avoid CORS issues)
  if (event.request.url.includes('firebasestorage.googleapis.com') && !isVideoOrAudio(event.request.url)) {
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

  // Handle same-origin requests for PWA offline support
  if (url.origin === location.origin) {
    // Skip hot module replacement and dev server stuff
    if (url.pathname.startsWith('/__') || url.pathname.includes('hot-update')) return

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses
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
