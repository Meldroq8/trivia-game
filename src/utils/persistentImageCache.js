// Smart image preloader and cache manager with localStorage data storage
class PersistentImageCache {
  constructor() {
    this.dbName = 'TriviaGameImageCache'
    this.version = 1
    this.storeName = 'images'
    this.db = null
    this.initPromise = this.init()
    // Memory cache for loaded images
    this.imageElements = new Map()
    this.loadingPromises = new Map()
    // localStorage keys
    this.localStoragePrefix = 'trivia_img_'
    this.localStorageMetaPrefix = 'trivia_img_meta_'
  }

  // Initialize IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        console.warn('🚫 IndexedDB not available, falling back to memory cache')
        resolve(null) // Graceful fallback
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('✅ IndexedDB image cache initialized')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          console.log('📦 Created IndexedDB object store for image metadata')
        }
      }
    })
  }

  // Generate stable key from URL (removes tokens/params)
  getStableKey(url) {
    try {
      // Remove Firebase auth tokens and create stable key
      const urlObj = new URL(url)
      const path = urlObj.pathname
      return btoa(path).replace(/[^a-zA-Z0-9]/g, '') // Base64 encode and clean
    } catch {
      // Fallback for invalid URLs
      return btoa(url.substring(0, 100)).replace(/[^a-zA-Z0-9]/g, '')
    }
  }

  // Store image data as base64 in localStorage with metadata
  async storeImageInLocalStorage(url, canvas) {
    try {
      const key = this.getStableKey(url)
      const dataKey = this.localStoragePrefix + key
      const metaKey = this.localStorageMetaPrefix + key

      // Convert canvas to base64
      const base64Data = canvas.toDataURL('image/jpeg', 0.8) // 80% quality for size optimization

      // Create metadata with URL hash for change detection
      const metadata = {
        url: url,
        timestamp: Date.now(),
        urlHash: this.hashString(url), // Simple hash of full URL for change detection
        size: base64Data.length,
        format: 'jpeg'
      }

      // Store both data and metadata
      localStorage.setItem(dataKey, base64Data)
      localStorage.setItem(metaKey, JSON.stringify(metadata))

      console.log(`💾 Stored image in localStorage: ${url.split('/').pop()?.split('?')[0]} (${(base64Data.length / 1024).toFixed(1)}KB)`)
      return true
    } catch (error) {
      console.warn('⚠️ Failed to store image in localStorage:', error)
      return false
    }
  }

  // Simple hash function for URL change detection
  hashString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  // Get image from localStorage if available and not changed
  getImageFromLocalStorage(url) {
    try {
      const key = this.getStableKey(url)
      const dataKey = this.localStoragePrefix + key
      const metaKey = this.localStorageMetaPrefix + key

      const metadataStr = localStorage.getItem(metaKey)
      const imageData = localStorage.getItem(dataKey)

      if (!metadataStr || !imageData) {
        return null
      }

      const metadata = JSON.parse(metadataStr)

      // Check if URL has changed (for detecting updated images)
      const currentUrlHash = this.hashString(url)
      if (metadata.urlHash !== currentUrlHash) {
        console.log(`🔄 URL changed, cache invalid: ${url.split('/').pop()?.split('?')[0]}`)
        // Clean up old cache
        localStorage.removeItem(dataKey)
        localStorage.removeItem(metaKey)
        return null
      }

      // Check if cache is expired (7 days)
      const maxAge = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - metadata.timestamp > maxAge) {
        console.log(`⏰ Cache expired: ${url.split('/').pop()?.split('?')[0]}`)
        localStorage.removeItem(dataKey)
        localStorage.removeItem(metaKey)
        return null
      }

      console.log(`⚡ Retrieved from localStorage: ${url.split('/').pop()?.split('?')[0]} (${(metadata.size / 1024).toFixed(1)}KB)`)
      return imageData // Return base64 data URL
    } catch (error) {
      console.warn('⚠️ Failed to retrieve image from localStorage:', error)
      return null
    }
  }

  // Store image metadata in IndexedDB (not the actual image data)
  async storeImageMetadata(url) {
    await this.initPromise
    if (!this.db) return false

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      const key = this.getStableKey(url)
      const data = {
        key,
        url,
        timestamp: Date.now(),
        cached: true
      }

      await new Promise((resolve, reject) => {
        const request = store.put(data)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      console.log(`📝 Stored image metadata: ${url.split('/').pop()?.split('?')[0]}`)
      return true
    } catch (error) {
      console.warn('⚠️ Failed to store image metadata:', error)
      return false
    }
  }

  // Check if image is cached (metadata only)
  async isImageCached(url) {
    await this.initPromise
    if (!this.db) return false

    try {
      const transaction = this.db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const key = this.getStableKey(url)

      return new Promise((resolve) => {
        const request = store.get(key)
        request.onsuccess = () => {
          const result = request.result
          if (result && this.isNotExpired(result.timestamp)) {
            console.log(`🎯 Metadata HIT: ${url.split('/').pop()?.split('?')[0]}`)
            resolve(true)
          } else {
            console.log(`❌ Metadata MISS: ${url.split('/').pop()?.split('?')[0]}`)
            resolve(false)
          }
        }
        request.onerror = () => resolve(false)
      })
    } catch (error) {
      console.warn('⚠️ Failed to check image cache status:', error)
      return false
    }
  }

  // Check if cached image is not expired (24 hours)
  isNotExpired(timestamp) {
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    return Date.now() - timestamp < maxAge
  }

  // Smart image loading with localStorage data caching
  async getCachedImageUrl(originalUrl) {
    if (!originalUrl) return null

    try {
      // First check localStorage for instant loading
      const cachedData = this.getImageFromLocalStorage(originalUrl)
      if (cachedData) {
        console.log(`⚡ INSTANT load from localStorage: ${originalUrl.split('/').pop()?.split('?')[0]}`)
        return cachedData // Return base64 data URL for instant display
      }

      // Check if this is a Firebase Storage URL
      if (originalUrl.includes('firebasestorage.googleapis.com')) {
        console.log(`🔥 Firebase Storage - using browser cache optimization: ${originalUrl.split('/').pop()?.split('?')[0]}`)

        // For Firebase Storage, we can't cache to localStorage due to CORS
        // But we can optimize by ensuring the image is preloaded in browser cache
        // and marking it as "cached" for faster subsequent loads

        try {
          // Preload the image in browser cache (this works without CORS issues)
          await this.preloadFirebaseImage(originalUrl)

          // Mark this URL as "browser cached" in sessionStorage
          sessionStorage.setItem(`firebase_cached_${this.hashString(originalUrl)}`, Date.now().toString())

          console.log(`🚀 Firebase image preloaded to browser cache: ${originalUrl.split('/').pop()?.split('?')[0]}`)
          return originalUrl // Return original URL - it's now in browser cache

        } catch (error) {
          console.log(`🔒 Firebase preload failed, using original URL: ${originalUrl.split('/').pop()?.split('?')[0]}`)
          return originalUrl
        }
      }

      // For non-Firebase images, attempt localStorage caching
      console.log(`🌐 Downloading and caching image: ${originalUrl.split('/').pop()?.split('?')[0]}`)

      // Load image with canvas for localStorage storage
      const canvas = await this.loadImageToCanvas(originalUrl)

      // Store in localStorage for next time
      await this.storeImageInLocalStorage(originalUrl, canvas)

      // Also store metadata in IndexedDB for compatibility
      await this.storeImageMetadata(originalUrl)

      // Return the base64 version for immediate use
      return canvas.toDataURL('image/jpeg', 0.8)

    } catch (error) {
      console.warn(`⚠️ Failed to load/cache image, using original URL: ${originalUrl.split('/').pop()?.split('?')[0]}`)
      return originalUrl // Fallback to original URL
    }
  }

  // Load image to canvas for localStorage storage
  async loadImageToCanvas(url) {
    return new Promise(async (resolve, reject) => {
      try {
        // For Firebase Storage images, use fetch with CORS mode
        if (url.includes('firebasestorage.googleapis.com')) {
          const response = await fetch(url, {
            mode: 'cors',
            credentials: 'omit'
          })
          if (!response.ok) throw new Error('Network response was not ok')

          const blob = await response.blob()
          const objectUrl = URL.createObjectURL(blob)

          const img = new Image()
          img.onload = () => {
            try {
              // Create canvas and draw image
              const canvas = document.createElement('canvas')
              const ctx = canvas.getContext('2d')

              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight

              ctx.drawImage(img, 0, 0)

              // Clean up object URL
              URL.revokeObjectURL(objectUrl)
              resolve(canvas)
            } catch (error) {
              URL.revokeObjectURL(objectUrl)
              reject(error)
            }
          }

          img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Failed to load image'))
          }

          img.src = objectUrl
        } else {
          // For other images, use regular method
          const img = new Image()

          img.onload = () => {
            try {
              // Create canvas and draw image
              const canvas = document.createElement('canvas')
              const ctx = canvas.getContext('2d')

              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight

              ctx.drawImage(img, 0, 0)
              resolve(canvas)
            } catch (error) {
              reject(error)
            }
          }

          img.onerror = () => {
            reject(new Error('Failed to load image'))
          }

          img.crossOrigin = 'anonymous'
          img.src = url
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  // Simple Firebase image preloader (CORS-free, browser cache only)
  async preloadFirebaseImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        resolve(img)
      }

      img.onerror = () => {
        reject(new Error('Failed to preload Firebase image'))
      }

      // Set a timeout to avoid hanging
      setTimeout(() => {
        reject(new Error('Firebase image preload timeout'))
      }, 10000) // 10 second timeout

      // Load the image (this puts it in browser cache)
      img.src = url
    })
  }

  // Store base64 data directly in localStorage
  async storeBase64InLocalStorage(url, base64Data) {
    try {
      const dataKey = `img_data_${this.hashString(url)}`
      const metaKey = `img_meta_${this.hashString(url)}`

      const metadata = {
        url: url,
        timestamp: Date.now(),
        urlHash: this.hashString(url),
        size: base64Data.length,
        format: 'jpeg'
      }

      localStorage.setItem(dataKey, base64Data)
      localStorage.setItem(metaKey, JSON.stringify(metadata))

      console.log(`💾 Stored Firebase image in localStorage: ${(base64Data.length / 1024).toFixed(1)}KB`)
      return true
    } catch (error) {
      console.warn('Failed to store Firebase image in localStorage:', error)
      return false
    }
  }

  // Simple image preloader (CORS-free)
  async preloadImageElement(url) {
    // Check if already in memory cache
    if (this.imageElements.has(url)) {
      return this.imageElements.get(url)
    }

    // Check if already loading
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)
    }

    // Start loading
    const loadingPromise = new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        // Store in memory cache
        this.imageElements.set(url, img)
        // Clean up loading promise
        this.loadingPromises.delete(url)
        resolve(img)
      }

      img.onerror = () => {
        // Clean up loading promise
        this.loadingPromises.delete(url)
        reject(new Error('Failed to load image'))
      }

      // Load image (no CORS issues with simple loading)
      img.src = url
    })

    // Store loading promise to prevent duplicate requests
    this.loadingPromises.set(url, loadingPromise)
    return loadingPromise
  }

  // Preload image into browser cache
  async preloadImage(url, silent = false) {
    if (!url) return null

    try {
      // Check if already cached
      const isCached = await this.isImageCached(url)
      if (isCached) {
        if (!silent) {
          console.log(`✅ Already cached: ${url.split('/').pop()?.split('?')[0]}`)
        }
        return url
      }

      // Preload the image
      await this.preloadImageElement(url)
      await this.storeImageMetadata(url)

      if (!silent) {
        console.log(`✅ Preloaded: ${url.split('/').pop()?.split('?')[0]}`)
      }

      return url

    } catch (error) {
      if (!silent) {
        console.warn(`⚠️ Preload failed: ${url.split('/').pop()?.split('?')[0]}`)
      }
      return url // Fallback to original URL
    }
  }

  // Clean old cache entries
  async cleanOldEntries() {
    await this.initPromise
    if (!this.db) return

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('timestamp')

      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days
      const range = IDBKeyRange.upperBound(cutoffTime)

      let deletedCount = 0
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          if (deletedCount > 0) {
            console.log(`🧹 Cleaned ${deletedCount} old cache entries`)
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to clean old cache entries:', error)
    }
  }

  // Clean up localStorage cache entries
  cleanLocalStorageCache() {
    try {
      let cleanedCount = 0
      const keys = Object.keys(localStorage)

      for (const key of keys) {
        if (key.startsWith(this.localStorageMetaPrefix)) {
          try {
            const metadata = JSON.parse(localStorage.getItem(key))
            const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days

            if (Date.now() - metadata.timestamp > maxAge) {
              // Remove both metadata and data
              const dataKey = key.replace(this.localStorageMetaPrefix, this.localStoragePrefix)
              localStorage.removeItem(key)
              localStorage.removeItem(dataKey)
              cleanedCount++
            }
          } catch (error) {
            // Invalid metadata, remove it
            localStorage.removeItem(key)
            cleanedCount++
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired localStorage cache entries`)
      }
    } catch (error) {
      console.warn('⚠️ Failed to clean localStorage cache:', error)
    }
  }

  // Get comprehensive cache stats
  async getStats() {
    await this.initPromise

    // Get IndexedDB stats
    let indexedDBStats = { count: 0 }
    if (this.db) {
      try {
        const transaction = this.db.transaction([this.storeName], 'readonly')
        const store = transaction.objectStore(this.storeName)

        indexedDBStats = await new Promise((resolve) => {
          const request = store.getAll()
          request.onsuccess = () => {
            const entries = request.result
            resolve({
              count: entries.length,
              oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : null
            })
          }
          request.onerror = () => resolve({ count: 0 })
        })
      } catch {
        indexedDBStats = { count: 0 }
      }
    }

    // Get localStorage stats
    let localStorageStats = { count: 0, totalSize: 0 }
    try {
      const keys = Object.keys(localStorage)
      let count = 0
      let totalSize = 0

      for (const key of keys) {
        if (key.startsWith(this.localStoragePrefix)) {
          count++
          totalSize += localStorage.getItem(key)?.length || 0
        }
      }

      localStorageStats = {
        count,
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      }
    } catch {
      localStorageStats = { count: 0, totalSize: 0, totalSizeMB: '0.00' }
    }

    return {
      indexedDB: indexedDBStats,
      localStorage: localStorageStats,
      memory: {
        count: this.imageElements.size,
        loadingCount: this.loadingPromises.size
      }
    }
  }
}

// Create singleton instance
const persistentImageCache = new PersistentImageCache()

// Auto-cleanup on initialization
persistentImageCache.initPromise.then(() => {
  // Clean up localStorage cache
  persistentImageCache.cleanLocalStorageCache()

  // Clean up IndexedDB cache
  persistentImageCache.cleanOldEntries()

  // Log cache stats
  persistentImageCache.getStats().then(stats => {
    console.log('📊 Image Cache Stats:', stats)
  })
})

export default persistentImageCache