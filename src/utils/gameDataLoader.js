import { devLog, devWarn, prodError } from "./devLog.js"
import { FirebaseQuestionsService } from './firebaseQuestions'

/**
 * Game Data Loader - Firebase Primary with Local Storage Caching
 * This service loads game data from Firebase and caches it locally for performance
 *
 * LAZY LOADING MODE:
 * - loadCategoriesOnly(): Loads only categories with their questionIds arrays (lightweight)
 * - loadQuestionsForCategories(categoryIds): Loads full questions for specific categories
 * - loadGameData(): Full load for backward compatibility (downloads everything)
 *
 * MEMORY CACHE:
 * - Module-level cache that survives component remounts
 * - Use getMemoryCache() for instant synchronous access
 * - Prevents lag when returning from QuestionView to GameBoard
 */

// Module-level memory cache - survives component remounts
let memoryCache = null
let memoryCacheSelectedCategories = null // Track which categories the cache was built for

export class GameDataLoader {
  static CACHE_KEY = 'triviaData'
  static CACHE_TIMESTAMP_KEY = 'triviaDataTimestamp'
  static CACHE_VERSION_KEY = 'triviaDataVersion'
  static CATEGORIES_CACHE_KEY = 'triviaCategories'
  static CATEGORIES_CACHE_TIMESTAMP_KEY = 'triviaCategoriesTimestamp'
  static CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours - categories rarely change

  // ============================================
  // MEMORY CACHE - Instant synchronous access
  // ============================================

  /**
   * Get cached game data synchronously (for instant component initialization)
   * @param {Array<string>} selectedCategories - Current selected categories to validate cache
   * @returns {Object|null} Cached game data or null if cache is invalid/empty
   */
  static getMemoryCache(selectedCategories = null) {
    if (!memoryCache) {
      devLog('📭 Memory cache empty')
      return null
    }

    // If categories are specified, check if cache matches
    if (selectedCategories && selectedCategories.length > 0) {
      const cacheCategories = memoryCacheSelectedCategories || []
      const categoriesMatch = selectedCategories.every(cat =>
        cat === 'mystery' || cacheCategories.includes(cat)
      )

      if (!categoriesMatch) {
        devLog('🔄 Memory cache categories mismatch - cache invalid')
        return null
      }
    }

    devLog('⚡ Using memory cache for instant render')
    return memoryCache
  }

  /**
   * Save game data to memory cache
   * @param {Object} data - Game data to cache
   * @param {Array<string>} selectedCategories - Categories this cache was built for
   */
  static setMemoryCache(data, selectedCategories = null) {
    memoryCache = data
    memoryCacheSelectedCategories = selectedCategories
    devLog('💾 Saved to memory cache', {
      categories: data?.categories?.length || 0,
      questions: Object.keys(data?.questions || {}).length,
      selectedCategories: selectedCategories?.length || 0
    })
  }

  /**
   * Merge additional questions into memory cache (for lazy loading)
   * @param {Object} newQuestions - New questions to merge (keyed by categoryId)
   */
  static mergeQuestionsToMemoryCache(newQuestions) {
    if (!memoryCache) return

    memoryCache = {
      ...memoryCache,
      questions: {
        ...memoryCache.questions,
        ...newQuestions
      }
    }
    devLog('🔀 Merged questions into memory cache', {
      newCategories: Object.keys(newQuestions).length,
      totalQuestions: Object.keys(memoryCache.questions).length
    })
  }

  /**
   * Clear memory cache (call when starting a completely new game)
   */
  static clearMemoryCache() {
    memoryCache = null
    memoryCacheSelectedCategories = null
    devLog('🗑️ Memory cache cleared')
  }

  // ============================================
  // DATA LOADING METHODS
  // ============================================

  /**
   * Load questions and categories with Firebase-first approach
   * @param {boolean} forceRefresh - Force refresh from Firebase even if cache is valid
   * @returns {Promise<Object>} Game data with questions and categories
   */
  static async loadGameData(forceRefresh = false) {
    devLog('⚡ Loading game data with performance optimizations...')

    try {
      // FAST PATH: Check if we should use cache (instant loading)
      if (!forceRefresh && this.isCacheValid()) {
        // Quick version check - compare category count with Firebase
        const cacheStillValid = await this.verifyCacheVersion()
        if (cacheStillValid) {
          devLog('📦 Using cached data for instant loading')
          return this.getFromCache()
        } else {
          devLog('🔄 Cache invalidated - new categories detected')
        }
      }

      // BACKGROUND LOADING: Load from Firebase
      devLog('🔥 Loading fresh data from Firebase...')
      const [questions, categories, masterCategories] = await Promise.all([
        FirebaseQuestionsService.getAllQuestions(),
        FirebaseQuestionsService.getAllCategories(),
        FirebaseQuestionsService.getAllMasterCategories()
      ])


      // Transform Firebase data to expected format
      const gameData = this.transformFirebaseData(questions, categories, masterCategories)

      // Cache for faster subsequent loads
      await this.saveToCache(gameData)

      devLog('✅ Game data loaded from Firebase:', {
        categories: gameData.categories.length,
        totalQuestions: Object.values(gameData.questions).flat().length
      })

      return gameData

    } catch (error) {
      prodError('❌ Error loading from Firebase:', error)

      // Fallback to cache even if expired (better than nothing)
      const cachedData = this.getFromCache()
      if (cachedData) {
        devLog('🔄 Using expired cached data as fallback')
        return cachedData
      }

      // Final fallback to sample data
      devLog('📄 Using sample data as final fallback')
      return this.loadSampleData()
    }
  }

  /**
   * LAZY LOADING: Load only categories with questionIds (no full questions)
   * This is much lighter than loadGameData() - use for initial page load
   * @param {boolean} forceRefresh - Force refresh from Firebase even if cache is valid
   * @returns {Promise<Object>} Game data with categories (no questions array, just questionIds)
   */
  static async loadCategoriesOnly(forceRefresh = false) {
    devLog('⚡ Loading categories only (lazy mode)...')

    try {
      // Check categories cache first
      if (!forceRefresh) {
        const cachedCategories = this.getCategoriesFromCache()
        if (cachedCategories) {
          devLog('📦 Using cached categories for instant loading')
          return cachedCategories
        }
      }

      // Load from Firebase
      devLog('🔥 Loading categories from Firebase...')
      const [categories, masterCategories] = await Promise.all([
        FirebaseQuestionsService.getCategoriesWithQuestionIds(),
        FirebaseQuestionsService.getAllMasterCategories()
      ])

      // Check if questionIds have been backfilled
      const categoriesWithQuestionIds = categories.filter(c => c.questionIds && c.questionIds.length > 0).length
      const backfillRatio = categories.length > 0 ? categoriesWithQuestionIds / categories.length : 0

      if (backfillRatio < 0.5) {
        devLog(`⚠️ Only ${categoriesWithQuestionIds}/${categories.length} categories have questionIds. Falling back to full load.`)
        devLog('💡 Run "تحديث معرفات الأسئلة" in Admin Settings to enable lazy loading.')
        return this.loadGameData(forceRefresh)
      }

      // Transform categories to expected format
      const transformedCategories = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        color: cat.color || 'bg-gray-500',
        image: cat.image || '📝',
        imageUrl: cat.imageUrl || '',
        showImageInQuestion: cat.showImageInQuestion !== false,
        showImageInAnswer: cat.showImageInAnswer !== false,
        enableQrMiniGame: cat.enableQrMiniGame || false,
        miniGameType: cat.miniGameType || 'charades',
        isMergedCategory: cat.isMergedCategory || false,
        sourceCategoryIds: cat.sourceCategoryIds || [],
        masterCategoryId: cat.masterCategoryId || 'general',
        displayOrder: cat.displayOrder || 0,
        description: cat.description || '',
        isHidden: cat.isHidden || false,
        createdAt: cat.createdAt?.toDate?.() || cat.createdAt || null,
        // LAZY LOADING FIELDS:
        questionIds: cat.questionIds || [],
        questionCount: cat.questionIds?.length || 0
      }))

      // Add Mystery Category if not exists
      let mysteryCategory = transformedCategories.find(cat => cat.id === 'mystery')
      if (!mysteryCategory) {
        let mysteryCategoryCustomizations = {}
        try {
          const savedMystery = localStorage.getItem('mystery_category_settings')
          if (savedMystery) {
            mysteryCategoryCustomizations = JSON.parse(savedMystery)
            if (mysteryCategoryCustomizations.imageUrl === '') {
              delete mysteryCategoryCustomizations.imageUrl
            }
          }
        } catch (error) {
          devWarn('Could not load mystery category customizations:', error)
        }

        mysteryCategory = {
          id: 'mystery',
          name: mysteryCategoryCustomizations.name || 'الفئة الغامضة',
          color: mysteryCategoryCustomizations.color || 'bg-purple-600',
          image: mysteryCategoryCustomizations.image || '❓',
          imageUrl: (mysteryCategoryCustomizations.imageUrl && mysteryCategoryCustomizations.imageUrl.trim()) || '/images/categories/category_mystery_1758939021986.webp',
          showImageInQuestion: mysteryCategoryCustomizations.showImageInQuestion !== false,
          showImageInAnswer: mysteryCategoryCustomizations.showImageInAnswer !== false,
          enableQrMiniGame: mysteryCategoryCustomizations.enableQrMiniGame || false,
          isMystery: true,
          questionIds: [],
          questionCount: 0
        }
        transformedCategories.push(mysteryCategory)
      } else {
        mysteryCategory.isMystery = true
      }

      const gameData = {
        categories: transformedCategories,
        masterCategories: masterCategories || [],
        questions: {}, // Empty - will be loaded on demand
        lazyLoaded: true // Flag to indicate this is lazy loaded data
      }

      // Cache categories
      this.saveCategoriesToCache(gameData)

      devLog('✅ Categories loaded (lazy mode):', {
        categories: gameData.categories.length,
        totalQuestionIds: gameData.categories.reduce((sum, c) => sum + (c.questionCount || 0), 0)
      })

      return gameData

    } catch (error) {
      prodError('❌ Error loading categories:', error)

      // Fallback to cached categories
      const cachedCategories = this.getCategoriesFromCache()
      if (cachedCategories) {
        devLog('🔄 Using cached categories as fallback')
        return cachedCategories
      }

      // Fall back to full load
      devLog('⚠️ Falling back to full loadGameData')
      return this.loadGameData()
    }
  }

  /**
   * Load full questions for specific categories (on-demand loading)
   * Use this when user starts a game with specific categories
   * @param {Array<string>} categoryIds - Category IDs to load questions for
   * @returns {Promise<Object>} Questions grouped by categoryId
   */
  static async loadQuestionsForCategories(categoryIds) {
    devLog(`📥 Loading questions for ${categoryIds.length} categories...`)

    try {
      const questions = await FirebaseQuestionsService.getQuestionsForCategories(categoryIds)

      // Transform questions to expected format
      const transformedQuestions = {}
      for (const [categoryId, categoryQuestions] of Object.entries(questions)) {
        transformedQuestions[categoryId] = categoryQuestions.map(q => ({
          id: q.id,
          text: q.text,
          answer: q.answer,
          answer2: q.answer2 || null,
          difficulty: q.difficulty || 'easy',
          points: q.points || 200,
          type: q.type || 'text',
          options: q.options || [],
          imageUrl: q.imageUrl || null,
          answerImageUrl: q.answerImageUrl || null,
          answerImageUrl2: q.answerImageUrl2 || null,
          audioUrl: q.audioUrl || null,
          answerAudioUrl: q.answerAudioUrl || null,
          videoUrl: q.videoUrl || null,
          answerVideoUrl: q.answerVideoUrl || null,
          toleranceHint: q.toleranceHint || null,
          category: q.categoryName || q.categoryId || 'عام',
          categoryId: categoryId
        }))
      }

      devLog(`✅ Loaded ${Object.values(transformedQuestions).flat().length} questions`)
      return transformedQuestions

    } catch (error) {
      prodError('❌ Error loading questions for categories:', error)
      throw error
    }
  }

  /**
   * Get categories from cache
   * @returns {Object|null} Cached categories or null
   */
  static getCategoriesFromCache() {
    try {
      const timestamp = localStorage.getItem(this.CATEGORIES_CACHE_TIMESTAMP_KEY)
      if (!timestamp) return null

      const age = Date.now() - parseInt(timestamp)
      if (age > this.CACHE_DURATION) {
        devLog('⏰ Categories cache expired')
        return null
      }

      const cached = localStorage.getItem(this.CATEGORIES_CACHE_KEY)
      if (cached) {
        const data = JSON.parse(cached)
        devLog('📦 Retrieved categories from cache')
        return data
      }
    } catch (error) {
      prodError('Error reading categories from cache:', error)
    }
    return null
  }

  /**
   * Save categories to cache
   * @param {Object} data - Categories data to cache
   */
  static saveCategoriesToCache(data) {
    try {
      const dataString = JSON.stringify(data)
      const dataSizeKB = (dataString.length / 1024).toFixed(2)

      // Categories should be much smaller than full data
      if (dataString.length > 500 * 1024) { // 500KB limit for categories
        devWarn(`⚠️ Categories data too large (${dataSizeKB} KB). Skipping cache.`)
        return
      }

      localStorage.setItem(this.CATEGORIES_CACHE_KEY, dataString)
      localStorage.setItem(this.CATEGORIES_CACHE_TIMESTAMP_KEY, Date.now().toString())
      devLog(`💾 Categories cached locally (${dataSizeKB} KB)`)
    } catch (error) {
      prodError('Error saving categories to cache:', error)
    }
  }

  /**
   * Clear categories cache
   */
  static clearCategoriesCache() {
    localStorage.removeItem(this.CATEGORIES_CACHE_KEY)
    localStorage.removeItem(this.CATEGORIES_CACHE_TIMESTAMP_KEY)
    devLog('🗑️ Categories cache cleared')
  }

  /**
   * Transform Firebase data to the format expected by the game
   * @param {Array} questions - Array of questions from Firebase
   * @param {Array} categories - Array of categories from Firebase
   * @param {Array} masterCategories - Array of master categories from Firebase
   * @returns {Object} Game data in expected format
   */
  static transformFirebaseData(questions, categories, masterCategories = []) {
    // Group questions by category
    const questionsByCategory = {}

    questions.forEach(question => {
      const categoryId = question.categoryId || 'general'
      if (!questionsByCategory[categoryId]) {
        questionsByCategory[categoryId] = []
      }
      questionsByCategory[categoryId].push({
        id: question.id,
        text: question.text,
        answer: question.answer,
        answer2: question.answer2 || null,
        difficulty: question.difficulty || 'easy',
        points: question.points || 200,
        type: question.type || 'text',
        options: question.options || [],
        imageUrl: question.imageUrl || null,
        answerImageUrl: question.answerImageUrl || null,
        answerImageUrl2: question.answerImageUrl2 || null,
        audioUrl: question.audioUrl || null,
        answerAudioUrl: question.answerAudioUrl || null,
        videoUrl: question.videoUrl || null,
        answerVideoUrl: question.answerVideoUrl || null,
        toleranceHint: question.toleranceHint || null,
        category: question.categoryName || question.categoryId || 'عام',
        categoryId: categoryId // Keep the actual categoryId for export filtering
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
      showImageInAnswer: cat.showImageInAnswer !== false,     // Default to true
      enableQrMiniGame: cat.enableQrMiniGame || false,        // QR mini-game setting
      miniGameType: cat.miniGameType || 'charades',           // Mini-game type (charades or drawing)
      isMergedCategory: cat.isMergedCategory || false,        // Merged category flag
      sourceCategoryIds: cat.sourceCategoryIds || [],         // Source category references
      masterCategoryId: cat.masterCategoryId || 'general',    // Master category for grouping
      displayOrder: cat.displayOrder || 0,                    // Display order within master
      description: cat.description || '',                     // Category description for info modal
      isHidden: cat.isHidden || false,                        // Visibility toggle for category
      createdAt: cat.createdAt?.toDate?.() || cat.createdAt || null  // For "newest categories" feature
    }))

    // Add Mystery Category at the end
    // First check if mystery category exists in Firebase, otherwise fall back to localStorage
    let mysteryCategory = transformedCategories.find(cat => cat.id === 'mystery')

    if (!mysteryCategory) {
      // Mystery category not in Firebase, check localStorage for backward compatibility
      let mysteryCategoryCustomizations = {}
      try {
        const savedMystery = localStorage.getItem('mystery_category_settings')
        if (savedMystery) {
          devLog('📦 Loading mystery category from localStorage (backward compatibility)')
          mysteryCategoryCustomizations = JSON.parse(savedMystery)

          // Force clear empty imageUrl to allow fallback
          if (mysteryCategoryCustomizations.imageUrl === '') {
            delete mysteryCategoryCustomizations.imageUrl
          }
        }
      } catch (error) {
        devWarn('Could not load mystery category customizations:', error)
      }

      // Create mystery category with localStorage data or defaults
      mysteryCategory = {
        id: 'mystery',
        name: mysteryCategoryCustomizations.name || 'الفئة الغامضة',
        color: mysteryCategoryCustomizations.color || 'bg-purple-600',
        image: mysteryCategoryCustomizations.image || '❓',
        imageUrl: (mysteryCategoryCustomizations.imageUrl && mysteryCategoryCustomizations.imageUrl.trim()) || '/images/categories/category_mystery_1758939021986.webp',
        showImageInQuestion: mysteryCategoryCustomizations.showImageInQuestion !== false,
        showImageInAnswer: mysteryCategoryCustomizations.showImageInAnswer !== false,
        enableQrMiniGame: mysteryCategoryCustomizations.enableQrMiniGame || false,
        isMystery: true // Special flag to identify this as the mystery category
      }

      transformedCategories.push(mysteryCategory)
    } else {
      // Mystery category exists in Firebase, ensure it has the isMystery flag
      mysteryCategory.isMystery = true
      devLog('🔥 Loaded mystery category from Firebase:', mysteryCategory.name)
    }

    // Add default category if it has questions but no category definition
    if (questionsByCategory.general && !transformedCategories.find(cat => cat.id === 'general')) {
      transformedCategories.push({
        id: 'general',
        name: 'عام',
        color: 'bg-gray-500',
        image: '📝',
        imageUrl: '',
        showImageInQuestion: true, // Default to true
        showImageInAnswer: true,   // Default to true
        enableQrMiniGame: false    // Default to false
      })
    }

    // Handle merged categories - dynamically pull questions from source categories
    transformedCategories.forEach(category => {
      if (category.isMergedCategory && category.sourceCategoryIds && category.sourceCategoryIds.length > 0) {
        // Collect questions from all source categories
        const mergedQuestions = []
        const validSources = []
        const missingSources = []

        category.sourceCategoryIds.forEach(sourceId => {
          if (questionsByCategory[sourceId]) {
            const sourceQuestions = questionsByCategory[sourceId]
            mergedQuestions.push(...sourceQuestions)
            validSources.push(sourceId)
          } else {
            missingSources.push(sourceId)
            devWarn(`⚠️ Source category ${sourceId} has no questions or doesn't exist`)
          }
        })

        // Store the dynamically merged questions
        questionsByCategory[category.id] = mergedQuestions

        if (missingSources.length > 0) {
          devWarn(`⚠️ Missing source categories for ${category.name}:`, missingSources)
        }
      }
    })

    return {
      categories: transformedCategories,
      questions: questionsByCategory,
      masterCategories: masterCategories || []
    }
  }

  /**
   * Check if cached data is still valid (time-based)
   * @returns {boolean} True if cache is valid
   */
  static isCacheValid() {
    const timestamp = localStorage.getItem(this.CACHE_TIMESTAMP_KEY)
    if (!timestamp) return false

    const age = Date.now() - parseInt(timestamp)
    return age < this.CACHE_DURATION
  }

  /**
   * Quick verification that cache is still valid by checking data version
   * This is a fast check that only reads a single document from Firebase
   * @returns {Promise<boolean>} True if cache version matches Firebase
   */
  static async verifyCacheVersion() {
    try {
      const cachedVersion = localStorage.getItem(this.CACHE_VERSION_KEY)
      if (!cachedVersion) return false

      // Quick version check from Firebase (single document read)
      const currentVersion = await FirebaseQuestionsService.getDataVersion()
      const cachedVersionNum = parseInt(cachedVersion)

      if (currentVersion !== cachedVersionNum) {
        devLog(`🔄 Data version changed: ${cachedVersionNum} → ${currentVersion}`)
        return false
      }

      return true
    } catch (error) {
      // If version check fails, still use cache (better than slow load)
      devWarn('⚠️ Version check failed, using cache anyway:', error.message)
      return true
    }
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
      prodError('Error reading from cache:', error)
    }
    return null
  }

  /**
   * Save data to cache
   * @param {Object} data - Game data to cache
   */
  static async saveToCache(data) {
    try {
      const dataString = JSON.stringify(data)
      const dataSizeKB = (dataString.length / 1024).toFixed(2)

      // Check if data is too large (localStorage limit is ~5-10MB depending on browser)
      // Skip caching if data is larger than 4MB to prevent quota errors
      if (dataString.length > 4 * 1024 * 1024) {
        devWarn(`⚠️ Data too large to cache (${dataSizeKB} KB). Skipping localStorage cache.`)
        return
      }

      localStorage.setItem(this.CACHE_KEY, dataString)
      localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString())
      // Save current data version for quick validation
      const currentVersion = await FirebaseQuestionsService.getDataVersion()
      localStorage.setItem(this.CACHE_VERSION_KEY, currentVersion.toString())
      devLog(`💾 Data cached locally (${dataSizeKB} KB, version ${currentVersion})`)
    } catch (error) {
      prodError('Error saving to cache:', error)
      // If quota exceeded, clear cache and try again with empty state
      if (error.name === 'QuotaExceededError') {
        devWarn('⚠️ Storage quota exceeded. Clearing old cache...')
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
    localStorage.removeItem(this.CACHE_VERSION_KEY)
    devLog('🗑️ Cache cleared')
  }

  /**
   * Load sample data as final fallback
   * @returns {Promise<Object>} Sample game data
   */
  static async loadSampleData() {
    try {
      const module = await import('../data/sampleQuestions.json')
      devLog('📄 Loaded sample data')
      return module.default
    } catch (error) {
      prodError('Error loading sample data:', error)
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
      prodError('Error getting game stats:', error)
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
    devLog('🗑️ Clearing game data cache...')
    localStorage.removeItem(this.CACHE_KEY)
    localStorage.removeItem(this.CACHE_TIMESTAMP_KEY)
  }

  /**
   * Nuclear cache clear - clears ALL possible caches
   */
  static clearAllCaches() {
    devLog('💣 NUCLEAR CACHE CLEAR - Clearing ALL possible caches...')

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
        devLog(`🗑️ Cleared localStorage: ${key}`)
      } catch (error) {
        devWarn(`Could not clear localStorage key ${key}:`, error)
      }
    })

    // 2. Clear all sessionStorage
    try {
      sessionStorage.clear()
      devLog('🗑️ Cleared all sessionStorage')
    } catch (error) {
      devWarn('Could not clear sessionStorage:', error)
    }

    // 3. Clear any IndexedDB caches (Firebase uses this)
    try {
      if ('indexedDB' in window) {
        // Clear Firebase IndexedDB cache
        indexedDB.deleteDatabase('firebaseLocalStorageDb')
        indexedDB.deleteDatabase('firebase-app-check-database')
        devLog('🗑️ Cleared Firebase IndexedDB caches')
      }
    } catch (error) {
      devWarn('Could not clear IndexedDB:', error)
    }

    // 4. Clear any service worker caches
    if ('serviceWorker' in navigator && 'caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.delete(cacheName)
          devLog(`🗑️ Cleared service worker cache: ${cacheName}`)
        })
      }).catch(error => {
        devWarn('Could not clear service worker caches:', error)
      })
    }

    // 5. Force browser to clear HTTP cache for Firebase requests
    if ('navigator' in window && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister()
          devLog('🗑️ Unregistered service worker')
        })
      }).catch(error => {
        devWarn('Could not unregister service workers:', error)
      })
    }

    devLog('💥 NUCLEAR CACHE CLEAR COMPLETED - All caches should be cleared!')

    // Force a page reload after a short delay to ensure all caches are cleared
    setTimeout(() => {
      devLog('🔄 Force refreshing page to ensure clean state...')
      window.location.reload(true)
    }, 1000)
  }

  /**
   * Refresh data from Firebase (force refresh)
   * @returns {Promise<Object>} Fresh game data
   */
  static async refreshFromFirebase() {
    devLog('🔄 Force refreshing from Firebase...')
    this.clearCache() // Clear cache before refresh
    return this.loadGameData(true)
  }
}