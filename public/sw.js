// Service Worker for Firebase Storage Image Caching
const CACHE_NAME = 'firebase-images-v1'
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days

// Helper function to check if URL is video or audio (avoid CORS issues)
function isVideoOrAudio(url) {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv']
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']
  const allExtensions = [...videoExtensions, ...audioExtensions]

  // Check if URL contains video/audio file patterns
  return allExtensions.some(ext => url.toLowerCase().includes(ext)) ||
         url.includes('question_video_') ||
         url.includes('answer_video_') ||
         url.includes('question_audio_') ||
         url.includes('answer_audio_')
}

self.addEventListener('fetch', (event) => {
  // Only cache Firebase Storage images (exclude video/audio to avoid CORS issues)
  if (event.request.url.includes('firebasestorage.googleapis.com') &&
      event.request.method === 'GET' &&
      !isVideoOrAudio(event.request.url)) {

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
          }).catch(error => {
            console.warn('⚠️ Service Worker fetch failed (non-critical):', error)
            // Let the browser handle the request normally
            return fetch(event.request)
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