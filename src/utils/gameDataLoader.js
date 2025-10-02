import { FirebaseQuestionsService } from './firebaseQuestions'

/**
 * Game Data Loader - Firebase Primary with Local Storage Caching
 * This service loads game data from Firebase and caches it locally for performance
 */
export class GameDataLoader {
  static CACHE_KEY = 'triviaData'
  static CACHE_TIMESTAMP_KEY = 'triviaDataTimestamp'
  static CACHE_DURATION = 30 * 60 * 1000 // 30 minutes in milliseconds - longer cache for faster loading

  /**
   * Load questions and categories with Firebase-first approach
   * @param {boolean} forceRefresh - Force refresh from Firebase even if cache is valid
   * @returns {Promise<Object>} Game data with questions and categories
   */
  static async loadGameData(forceRefresh = false) {
    console.log('⚡ Loading game data with performance optimizations...')

    try {
      // FAST PATH: Check if we should use cache (instant loading)
      if (!forceRefresh && this.isCacheValid()) {
        console.log('📦 Using cached data for instant loading')
        return this.getFromCache()
      }

      // BACKGROUND LOADING: Load from Firebase
      console.log('🔥 Loading fresh data from Firebase...')
      const [questions, categories] = await Promise.all([
        FirebaseQuestionsService.getAllQuestions(),
        FirebaseQuestionsService.getAllCategories()
      ])


      // Transform Firebase data to expected format
      const gameData = this.transformFirebaseData(questions, categories)

      // Note: localStorage caching disabled for large datasets
      // All data is stored in Firebase Firestore, media files in CloudFront

      console.log('✅ Game data loaded from Firebase:', {
        categories: gameData.categories.length,
        totalQuestions: Object.values(gameData.questions).flat().length
      })

      return gameData

    } catch (error) {
      console.error('❌ Error loading from Firebase:', error)

      // Fallback to cache even if expired (better than nothing)
      const cachedData = this.getFromCache()
      if (cachedData) {
        console.log('🔄 Using expired cached data as fallback')
        return cachedData
      }

      // Final fallback to sample data
      console.log('📄 Using sample data as final fallback')
      return this.loadSampleData()
    }
  }

  /**
   * Transform Firebase data to the format expected by the game
   * @param {Array} questions - Array of questions from Firebase
   * @param {Array} categories - Array of categories from Firebase
   * @returns {Object} Game data in expected format
   */
  static transformFirebaseData(questions, categories) {
    console.log(`🔄 transformFirebaseData called with ${questions.length} questions and ${categories.length} categories`)

    // Group questions by category
    const questionsByCategory = {}

    questions.forEach(question => {
      const categoryId = question.categoryId || 'general'
      if (!questionsByCategory[categoryId]) {
        questionsByCategory[categoryId] = []
        console.log(`📁 Creating new question array for category: ${categoryId}`)
      }
      questionsByCategory[categoryId].push({
        id: question.id,
        text: question.text,
        answer: question.answer,
        difficulty: question.difficulty || 'easy',
        points: question.points || 200,
        type: question.type || 'text',
        options: question.options || [],
        imageUrl: question.imageUrl || null,
        answerImageUrl: question.answerImageUrl || null,
        audioUrl: question.audioUrl || null,
        answerAudioUrl: question.answerAudioUrl || null,
        videoUrl: question.videoUrl || null,
        answerVideoUrl: question.answerVideoUrl || null,
        category: question.categoryName || question.categoryId || 'عام'
      })
    })

    // Transform categories to expected format
    const transformedCategories = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      color: cat.color || 'bg-gray-500',
      image: cat.image || '📝',
      imageUrl: cat.imageUrl || '',
      showImageInQuestion: cat.showImageInQuestion !== false, // Default to true
      showImageInAnswer: cat.showImageInAnswer !== false      // Default to true
    }))

    // Add Mystery Category at the end
    // Check localStorage for any saved mystery category customizations
    let mysteryCategoryCustomizations = {}
    try {
      const savedMystery = localStorage.getItem('mystery_category_settings')
      if (savedMystery) {
        mysteryCategoryCustomizations = JSON.parse(savedMystery)
        console.log('🔍 Loaded mystery customizations from localStorage:', mysteryCategoryCustomizations)

        // Force clear empty imageUrl to allow fallback
        if (mysteryCategoryCustomizations.imageUrl === '') {
          console.log('🔧 Clearing empty imageUrl from localStorage to allow fallback')
          delete mysteryCategoryCustomizations.imageUrl
        }
      }
    } catch (error) {
      console.warn('Could not load mystery category customizations:', error)
    }

    const mysteryCategory = {
      id: 'mystery',
      name: mysteryCategoryCustomizations.name || 'الفئة الغامضة',
      color: mysteryCategoryCustomizations.color || 'bg-purple-600',
      image: mysteryCategoryCustomizations.image || '❓',
      imageUrl: (mysteryCategoryCustomizations.imageUrl && mysteryCategoryCustomizations.imageUrl.trim()) || '/images/categories/category_mystery_1758939021986.webp',
      showImageInQuestion: mysteryCategoryCustomizations.showImageInQuestion !== false,
      showImageInAnswer: mysteryCategoryCustomizations.showImageInAnswer !== false,
      isMystery: true // Special flag to identify this as the mystery category
    }

    console.log('🔍 Mystery category created:', mysteryCategory)
    console.log('🔍 Mystery imageUrl:', mysteryCategory.imageUrl)
    transformedCategories.push(mysteryCategory)

    // Log questions per category for debugging
    console.log('📊 Questions per category after grouping:')
    Object.entries(questionsByCategory).forEach(([catId, qs]) => {
      const category = transformedCategories.find(c => c.id === catId)
      const catName = category?.name || catId
      console.log(`  - ${catName} (categoryId: ${catId}): ${qs.length} questions`)
    })

    // Log categories from Firebase for debugging
    console.log('📂 Categories from Firebase:')
    transformedCategories.forEach(cat => {
      if (!cat.isMystery) {
        console.log(`  - ${cat.name} (Firebase doc ID: ${cat.id})`)
      }
    })

    // Add default category if it has questions but no category definition
    if (questionsByCategory.general && !transformedCategories.find(cat => cat.id === 'general')) {
      transformedCategories.push({
        id: 'general',
        name: 'عام',
        color: 'bg-gray-500',
        image: '📝',
        imageUrl: '',
        showImageInQuestion: true, // Default to true
        showImageInAnswer: true    // Default to true
      })
    }

    return {
      categories: transformedCategories,
      questions: questionsByCategory
    }
  }

  /**
   * Check if cached data is still valid
   * @returns {boolean} True if cache is valid
   */
  static isCacheValid() {
    const timestamp = localStorage.getItem(this.CACHE_TIMESTAMP_KEY)
    if (!timestamp) return false

    const age = Date.now() - parseInt(timestamp)
    return age < this.CACHE_DURATION
  }

  /**
   * Get data from cache
   * @returns {Object|null} Cached game data or null
   */
  static getFromCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.error('Error reading from cache:', error)
    }
    return null
  }

  /**
   * Save data to cache
   * @param {Object} data - Game data to cache
   */
  static saveToCache(data) {
    try {
      const dataString = JSON.stringify(data)
      const dataSizeKB = (dataString.length / 1024).toFixed(2)

      // Check if data is too large (localStorage limit is ~5-10MB depending on browser)
      // Skip caching if data is larger than 4MB to prevent quota errors
      if (dataString.length > 4 * 1024 * 1024) {
        console.warn(`⚠️ Data too large to cache (${dataSizeKB} KB). Skipping localStorage cache.`)
        return
      }

      localStorage.setItem(this.CACHE_KEY, dataString)
      localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString())
      console.log(`💾 Data cached locally (${dataSizeKB} KB)`)
    } catch (error) {
      console.error('Error saving to cache:', error)
      // If quota exceeded, clear cache and try again with empty state
      if (error.name === 'QuotaExceededError') {
        console.warn('⚠️ Storage quota exceeded. Clearing old cache...')
        this.clearCache()
      }
    }
  }

  /**
   * Clear cache (force refresh on next load)
   */
  static clearCache() {
    localStorage.removeItem(this.CACHE_KEY)
    localStorage.removeItem(this.CACHE_TIMESTAMP_KEY)
    console.log('🗑️ Cache cleared')
  }

  /**
   * Load sample data as final fallback
   * @returns {Promise<Object>} Sample game data
   */
  static async loadSampleData() {
    try {
      const module = await import('../data/sampleQuestions.json')
      console.log('📄 Loaded sample data')
      return module.default
    } catch (error) {
      console.error('Error loading sample data:', error)
      // Return minimal fallback
      return {
        categories: [
          {
            id: 'general',
            name: 'عام',
            color: 'bg-gray-500',
            image: '📝',
            imageUrl: ''
          }
        ],
        questions: {
          general: [
            {
              text: 'سؤال تجريبي: ما هو 2 + 2؟',
              answer: '4',
              difficulty: 'easy',
              points: 200,
              type: 'text',
              options: [],
              category: 'عام'
            }
          ]
        }
      }
    }
  }

  /**
   * Get game statistics
   * @returns {Promise<Object>} Statistics about the game data
   */
  static async getGameStats() {
    try {
      const data = await this.loadGameData()
      const totalQuestions = Object.values(data.questions).flat().length

      const stats = {
        categories: data.categories.length,
        totalQuestions,
        questionsByCategory: {},
        source: 'firebase' // Indicates data source
      }

      // Count questions per category
      Object.entries(data.questions).forEach(([categoryId, questions]) => {
        const category = data.categories.find(cat => cat.id === categoryId)
        stats.questionsByCategory[category?.name || categoryId] = questions.length
      })

      return stats
    } catch (error) {
      console.error('Error getting game stats:', error)
      return {
        categories: 0,
        totalQuestions: 0,
        questionsByCategory: {},
        source: 'error'
      }
    }
  }

  /**
   * Clear cached data
   */
  static clearCache() {
    console.log('🗑️ Clearing game data cache...')
    localStorage.removeItem(this.CACHE_KEY)
    localStorage.removeItem(this.CACHE_TIMESTAMP_KEY)
  }

  /**
   * Nuclear cache clear - clears ALL possible caches
   */
  static clearAllCaches() {
    console.log('💣 NUCLEAR CACHE CLEAR - Clearing ALL possible caches...')

    // 1. Clear all localStorage keys (including game stats)
    const localStorageKeys = [
      this.CACHE_KEY,                    // 'triviaData'
      this.CACHE_TIMESTAMP_KEY,          // 'triviaDataTimestamp'
      'trivia-game-history',             // Game history
      'trivia-game-team-stats',          // Team stats
      'firebaseui::rememberedAccounts',  // Firebase auth cache
      'firebase:previous_websocket_failure', // Firebase connection cache
    ]

    localStorageKeys.forEach(key => {
      try {
        localStorage.removeItem(key)
        console.log(`🗑️ Cleared localStorage: ${key}`)
      } catch (error) {
        console.warn(`Could not clear localStorage key ${key}:`, error)
      }
    })

    // 2. Clear all sessionStorage
    try {
      sessionStorage.clear()
      console.log('🗑️ Cleared all sessionStorage')
    } catch (error) {
      console.warn('Could not clear sessionStorage:', error)
    }

    // 3. Clear any IndexedDB caches (Firebase uses this)
    try {
      if ('indexedDB' in window) {
        // Clear Firebase IndexedDB cache
        indexedDB.deleteDatabase('firebaseLocalStorageDb')
        indexedDB.deleteDatabase('firebase-app-check-database')
        console.log('🗑️ Cleared Firebase IndexedDB caches')
      }
    } catch (error) {
      console.warn('Could not clear IndexedDB:', error)
    }

    // 4. Clear any service worker caches
    if ('serviceWorker' in navigator && 'caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName)
          console.log(`🗑️ Cleared service worker cache: ${cacheName}`)
        })
      }).catch(error => {
        console.warn('Could not clear service worker caches:', error)
      })
    }

    // 5. Force browser to clear HTTP cache for Firebase requests
    if ('navigator' in window && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister()
          console.log('🗑️ Unregistered service worker')
        })
      }).catch(error => {
        console.warn('Could not unregister service workers:', error)
      })
    }

    console.log('💥 NUCLEAR CACHE CLEAR COMPLETED - All caches should be cleared!')

    // Force a page reload after a short delay to ensure all caches are cleared
    setTimeout(() => {
      console.log('🔄 Force refreshing page to ensure clean state...')
      window.location.reload(true)
    }, 1000)
  }

  /**
   * Refresh data from Firebase (force refresh)
   * @returns {Promise<Object>} Fresh game data
   */
  static async refreshFromFirebase() {
    console.log('🔄 Force refreshing from Firebase...')
    this.clearCache() // Clear cache before refresh
    return this.loadGameData(true)
  }
}