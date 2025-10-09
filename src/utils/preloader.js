import { devLog, devWarn, prodError } from "./devLog.js"
// Preloader utility for images and audio files
import persistentImageCache from './persistentImageCache.js'
import { getOptimizedMediaUrl } from './mediaUrlConverter.js'

class GamePreloader {
  constructor() {
    this.preloadedImages = new Set()
    this.preloadedAudio = new Set()
    this.preloadedVideos = new Set()
    this.imageCache = new Map() // URL -> blob URL (for session)
    this.audioCache = new Map() // URL -> blob URL
    this.videoCache = new Map() // URL -> blob URL
    this.imageBlobCache = new Map() // URL -> blob
    this.audioBlobCache = new Map() // URL -> blob
    this.videoBlobCache = new Map() // URL -> blob
    this.persistentCache = persistentImageCache
  }

  // Preload an image using persistent IndexedDB cache
  async preloadImage(imageUrl, silent = false) {
    if (!imageUrl || this.preloadedImages.has(imageUrl)) {
      // Check if we have a cached blob URL already in session
      const sessionCacheUrl = this.imageCache.get(imageUrl)
      return Promise.resolve(sessionCacheUrl || imageUrl)
    }

    // Convert local paths to CloudFront URLs first
    const optimizedUrl = getOptimizedMediaUrl(imageUrl, 'medium', 'question')
    if (!silent) {
      devLog(`🔄 Preloading image: ${imageUrl} → ${optimizedUrl}`)
    }

    try {
      // Use persistent cache for true cross-refresh caching
      const blobUrl = await this.persistentCache.preloadImage(optimizedUrl, silent)

      // Mark as preloaded and store in session cache
      this.preloadedImages.add(imageUrl)
      this.imageCache.set(imageUrl, blobUrl)

      return blobUrl
    } catch (error) {
      if (!silent) {
        devWarn(`⚠️ Persistent cache preload failed: ${imageUrl.split('/').pop()?.split('?')[0]}`)
      }
      // Fallback to original URL
      return imageUrl
    }
  }

  // Preload an audio file and create blob URL
  preloadAudio(audioUrl) {
    if (!audioUrl || this.preloadedAudio.has(audioUrl)) {
      return Promise.resolve(this.audioCache.get(audioUrl))
    }

    // Convert local paths to CloudFront URLs first
    const optimizedUrl = getOptimizedMediaUrl(audioUrl, 'medium', 'audio')
    devLog(`🔄 Preloading audio: ${audioUrl} → ${optimizedUrl}`)

    return new Promise((resolve, reject) => {
      // Try fetch first, fallback to audio element if CORS issues
      fetch(optimizedUrl)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob)
          this.preloadedAudio.add(audioUrl)
          this.audioCache.set(audioUrl, blobUrl)
          this.audioBlobCache.set(audioUrl, blob)
          devLog(`✅ Audio cached: ${audioUrl.split('/').pop()?.split('?')[0]}`)
          resolve(blobUrl)
        })
        .catch(error => {
          // Fallback: Use audio element for preloading
          devWarn(`⚠️ CORS issue, using audio element preload: ${optimizedUrl.split('/').pop()?.split('?')[0]}`)

          const audio = new Audio()
          audio.preload = 'metadata'

          audio.onloadedmetadata = () => {
            this.preloadedAudio.add(audioUrl)
            this.audioCache.set(audioUrl, optimizedUrl) // Store optimized URL
            resolve(optimizedUrl)
          }

          audio.onerror = () => {
            devWarn(`⚠️ Audio will load on-demand: ${optimizedUrl.split('/').pop()?.split('?')[0]}`)
            resolve(optimizedUrl) // Resolve with optimized URL
          }

          audio.src = optimizedUrl
        })
    })
  }

  // Preload a video file and create blob URL
  preloadVideo(videoUrl) {
    if (!videoUrl || this.preloadedVideos.has(videoUrl)) {
      return Promise.resolve(this.videoCache.get(videoUrl))
    }

    // Convert local paths to CloudFront URLs first
    const optimizedUrl = getOptimizedMediaUrl(videoUrl, 'medium', 'video')
    devLog(`🔄 Preloading video: ${videoUrl} → ${optimizedUrl}`)

    return new Promise((resolve, reject) => {
      // Use video element for preloading to avoid CORS issues
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.crossOrigin = 'anonymous'

      video.onloadedmetadata = () => {
        // Mark as preloaded but don't create blob URL (CORS limitation)
        this.preloadedVideos.add(videoUrl)
        this.videoCache.set(videoUrl, optimizedUrl) // Store optimized URL
        devLog(`✅ Video preloaded: ${optimizedUrl.split('/').pop()?.split('?')[0]}`)
        resolve(optimizedUrl)
      }

      video.onerror = (error) => {
        devWarn(`⚠️ Video will load on-demand: ${optimizedUrl.split('/').pop()?.split('?')[0]}`)
        // Still resolve with optimized URL as fallback
        resolve(optimizedUrl)
      }

      video.src = optimizedUrl
    })
  }

  // Get cached image URL from persistent cache or create one
  getCachedImageUrl(originalUrl) {
    if (!originalUrl) return null

    // First check session cache
    const sessionCacheUrl = this.imageCache.get(originalUrl)
    if (sessionCacheUrl) {
      return sessionCacheUrl
    }

    // If not in session cache, use persistent cache (async, but will fallback gracefully)
    // This returns a Promise, but we need sync behavior for React renders
    // So we'll trigger the cache load and return original URL as fallback
    this.persistentCache.getCachedImageUrl(originalUrl).then(cachedUrl => {
      if (cachedUrl !== originalUrl) {
        // Update session cache with the blob URL
        this.imageCache.set(originalUrl, cachedUrl)
      }
    }).catch(() => {
      // Fallback gracefully
    })

    // Return original URL immediately (image will update when cache loads)
    return originalUrl
  }

  // Get cached audio URL (blob URL if cached, original URL if not)
  getCachedAudioUrl(originalUrl) {
    return this.audioCache.get(originalUrl) || originalUrl
  }

  // Get cached video URL (blob URL if cached, original URL if not)
  getCachedVideoUrl(originalUrl) {
    return this.videoCache.get(originalUrl) || originalUrl
  }

  // Preload all questions' assets (images, audio, and video)
  async preloadQuestionAssets(questions, maxConcurrent = 3, onProgress = null) {
    if (!questions || questions.length === 0) return

    const allAssets = []

    // Collect all unique images and audio files
    questions.forEach(question => {
      const q = question.question || question

      // Cache question images
      if (q.imageUrl && !this.preloadedImages.has(q.imageUrl)) {
        allAssets.push({ type: 'image', url: q.imageUrl })
      }

      // Cache answer images (answerImageUrl field)
      if (q.answerImageUrl && !this.preloadedImages.has(q.answerImageUrl)) {
        allAssets.push({ type: 'image', url: q.answerImageUrl })
      }

      // Also check nested answer images (some questions might have this structure)
      if (question.answerImageUrl && !this.preloadedImages.has(question.answerImageUrl)) {
        allAssets.push({ type: 'image', url: question.answerImageUrl })
      }

      // Cache question audio files
      if (q.audioUrl && !this.preloadedAudio.has(q.audioUrl)) {
        allAssets.push({ type: 'audio', url: q.audioUrl })
      }

      // Cache answer audio files (answerAudioUrl field)
      if (q.answerAudioUrl && !this.preloadedAudio.has(q.answerAudioUrl)) {
        allAssets.push({ type: 'audio', url: q.answerAudioUrl })
      }

      // Also check nested answer audio (some questions might have this structure)
      if (question.answerAudioUrl && !this.preloadedAudio.has(question.answerAudioUrl)) {
        allAssets.push({ type: 'audio', url: question.answerAudioUrl })
      }

      // Cache question video files
      if (q.videoUrl && !this.preloadedVideos.has(q.videoUrl)) {
        allAssets.push({ type: 'video', url: q.videoUrl })
      }

      // Cache answer video files (answerVideoUrl field)
      if (q.answerVideoUrl && !this.preloadedVideos.has(q.answerVideoUrl)) {
        allAssets.push({ type: 'video', url: q.answerVideoUrl })
      }

      // Also check nested answer video (some questions might have this structure)
      if (question.answerVideoUrl && !this.preloadedVideos.has(question.answerVideoUrl)) {
        allAssets.push({ type: 'video', url: question.answerVideoUrl })
      }
    })

    devLog(`🚀 Starting preload of ${allAssets.length} assets...`)

    let completed = 0

    // Preload assets in batches to avoid overwhelming the browser
    const batches = []
    for (let i = 0; i < allAssets.length; i += maxConcurrent) {
      batches.push(allAssets.slice(i, i + maxConcurrent))
    }

    for (const batch of batches) {
      const promises = batch.map(asset => {
        let promise
        if (asset.type === 'image') {
          promise = this.preloadImage(asset.url).catch(() => null)
        } else if (asset.type === 'audio') {
          promise = this.preloadAudio(asset.url).catch(() => null)
        } else if (asset.type === 'video') {
          promise = this.preloadVideo(asset.url).catch(() => null)
        } else {
          promise = Promise.resolve(null)
        }

        return promise.finally(() => {
          completed++
          if (onProgress) {
            onProgress(completed, allAssets.length)
          }
        })
      })

      await Promise.allSettled(promises)
    }

    devLog(`✅ Preloading complete. Images: ${this.preloadedImages.size}, Audio: ${this.preloadedAudio.size}`)
  }

  // Get preloaded status
  getPreloadStatus() {
    return {
      images: this.preloadedImages.size,
      audio: this.preloadedAudio.size,
      totalPreloaded: this.preloadedImages.size + this.preloadedAudio.size
    }
  }

  // Check if an asset is preloaded
  isImagePreloaded(imageUrl) {
    return this.preloadedImages.has(imageUrl)
  }

  isAudioPreloaded(audioUrl) {
    return this.preloadedAudio.has(audioUrl)
  }

  // Clear cache (for memory management)
  clearCache() {
    // Revoke blob URLs to free memory
    this.imageCache.forEach(blobUrl => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl)
      }
    })
    this.audioCache.forEach(blobUrl => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl)
      }
    })

    this.preloadedImages.clear()
    this.preloadedAudio.clear()
    this.imageCache.clear()
    this.audioCache.clear()
    this.imageBlobCache.clear()
    this.audioBlobCache.clear()

    // Also clean old entries from persistent cache
    this.persistentCache.cleanOldEntries()

    devLog('🧹 Preloader cache cleared (persistent cache maintained)')
  }

  // Get cache statistics including persistent cache
  async getCacheStats() {
    const persistentStats = await this.persistentCache.getStats()

    return {
      session: {
        images: this.preloadedImages.size,
        audio: this.preloadedAudio.size,
        totalPreloaded: this.preloadedImages.size + this.preloadedAudio.size
      },
      persistent: {
        count: persistentStats.count,
        size: persistentStats.size,
        sizeFormatted: `${(persistentStats.size / (1024 * 1024)).toFixed(2)}MB`
      }
    }
  }
}

// Create a singleton instance
export const gamePreloader = new GamePreloader()
export default gamePreloader