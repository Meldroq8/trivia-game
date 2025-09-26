// Service Worker for Firebase Storage Image Caching
const CACHE_NAME = 'firebase-images-v1'
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days

self.addEventListener('fetch', (event) => {
  // Only cache Firebase Storage images
  if (event.request.url.includes('firebasestorage.googleapis.com') &&
      event.request.method === 'GET') {

    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // Check if cached version exists and is not expired
          if (response) {
            const cachedDate = new Date(response.headers.get('sw-cached-date'))
            if (Date.now() - cachedDate.getTime() < CACHE_EXPIRY) {
              console.log('🚀 Loading from Service Worker cache:', event.request.url.split('/').pop())
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
              console.log('💾 Cached Firebase image to Service Worker:', event.request.url.split('/').pop())
            }

            return networkResponse
          })
        })
      })
    )
  }
})

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})