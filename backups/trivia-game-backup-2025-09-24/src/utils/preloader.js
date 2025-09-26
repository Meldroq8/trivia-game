// Preloader utility for images and audio files
class GamePreloader {
  constructor() {
    this.preloadedImages = new Set()
    this.preloadedAudio = new Set()
    this.imageCache = new Map() // URL -> blob URL
    this.audioCache = new Map() // URL -> blob URL
    this.imageBlobCache = new Map() // URL -> blob
    this.audioBlobCache = new Map() // URL -> blob
  }

  // Preload an image and create blob URL
  preloadImage(imageUrl) {
    if (!imageUrl || this.preloadedImages.has(imageUrl)) {
      return Promise.resolve(this.imageCache.get(imageUrl))
    }

    return new Promise((resolve, reject) => {
      fetch(imageUrl)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob)
          this.preloadedImages.add(imageUrl)
          this.imageCache.set(imageUrl, blobUrl)
          this.imageBlobCache.set(imageUrl, blob)
          console.log(`✅ Preloaded image: ${imageUrl} -> ${blobUrl}`)
          resolve(blobUrl)
        })
        .catch(error => {
          console.warn(`❌ Failed to preload image: ${imageUrl}`, error)
          reject(error)
        })
    })
  }

  // Preload an audio file and create blob URL
  preloadAudio(audioUrl) {
    if (!audioUrl || this.preloadedAudio.has(audioUrl)) {
      return Promise.resolve(this.audioCache.get(audioUrl))
    }

    return new Promise((resolve, reject) => {
      fetch(audioUrl)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.blob()
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob)
          this.preloadedAudio.add(audioUrl)
          this.audioCache.set(audioUrl, blobUrl)
          this.audioBlobCache.set(audioUrl, blob)
          console.log(`✅ Preloaded audio: ${audioUrl} -> ${blobUrl}`)
          resolve(blobUrl)
        })
        .catch(error => {
          console.warn(`❌ Failed to preload audio: ${audioUrl}`, error)
          reject(error)
        })
    })
  }

  // Get cached image URL (blob URL if cached, original URL if not)
  getCachedImageUrl(originalUrl) {
    return this.imageCache.get(originalUrl) || originalUrl
  }

  // Get cached audio URL (blob URL if cached, original URL if not)
  getCachedAudioUrl(originalUrl) {
    return this.audioCache.get(originalUrl) || originalUrl
  }

  // Preload all questions' assets (images and audio)
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

      // Cache audio files
      if (q.audioUrl && !this.preloadedAudio.has(q.audioUrl)) {
        allAssets.push({ type: 'audio', url: q.audioUrl })
      }
    })

    console.log(`🚀 Starting preload of ${allAssets.length} assets...`)

    let completed = 0

    // Preload assets in batches to avoid overwhelming the browser
    const batches = []
    for (let i = 0; i < allAssets.length; i += maxConcurrent) {
      batches.push(allAssets.slice(i, i + maxConcurrent))
    }

    for (const batch of batches) {
      const promises = batch.map(asset => {
        const promise = asset.type === 'image'
          ? this.preloadImage(asset.url).catch(() => null)
          : this.preloadAudio(asset.url).catch(() => null)

        return promise.finally(() => {
          completed++
          if (onProgress) {
            onProgress(completed, allAssets.length)
          }
        })
      })

      await Promise.allSettled(promises)
    }

    console.log(`✅ Preloading complete. Images: ${this.preloadedImages.size}, Audio: ${this.preloadedAudio.size}`)
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
      if (blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl)
      }
    })
    this.audioCache.forEach(blobUrl => {
      if (blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl)
      }
    })

    this.preloadedImages.clear()
    this.preloadedAudio.clear()
    this.imageCache.clear()
    this.audioCache.clear()
    this.imageBlobCache.clear()
    this.audioBlobCache.clear()
    console.log('🧹 Preloader cache cleared')
  }
}

// Create a singleton instance
export const gamePreloader = new GamePreloader()
export default gamePreloader