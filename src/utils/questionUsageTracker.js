import { devLog, devWarn, prodError } from "./devLog.js"
/**
 * Account-wise Question Usage Tracker with Firebase Firestore
 *
 * This service tracks which questions have been used per user account
 * across all devices. Questions are only repeated after ALL questions in the pool
 * have been used at least once.
 */

import { db } from '../firebase/config'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

class QuestionUsageTracker {
  constructor() {
    this.STORAGE_KEY = 'trivia-global-question-usage'
    this.POOL_SIZE_KEY = 'trivia-question-pool-size'
    this.currentUserId = null
    this.localCache = null

    // Rate limiting and batching
    this.pendingWrites = new Set()
    this.lastWriteTime = 0
    this.WRITE_THROTTLE_MS = 2000 // Minimum 2 seconds between Firebase writes
    this.saveTimeout = null

    // Prevent duplicate pool updates in same session
    this.poolUpdatedInSession = false
    this.poolUpdateInProgress = false

    // Prevent duplicate sync operations
    this.syncInProgress = false

    // Sync completion tracking - allows components to wait for sync
    this.syncPromise = null
    this.syncResolve = null
    this.syncComplete = false

    // Prevent concurrent data loads
    this.loadingPromise = null
  }

  /**
   * Wait for the initial sync to complete
   * Components should call this before loading counts to ensure data is ready
   * @param {number} timeout - Maximum time to wait in ms (default 10s)
   * @returns {Promise<boolean>} True if sync completed, false if timed out
   */
  async waitForSync(timeout = 10000) {
    // If no sync is in progress and not complete, return immediately
    if (!this.syncPromise && !this.syncComplete) {
      devLog('⏳ No sync in progress, proceeding without wait')
      return true
    }

    // If already complete, return immediately
    if (this.syncComplete) {
      devLog('✅ Sync already complete, proceeding')
      return true
    }

    // Wait for sync with timeout
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout')), timeout)
      )
      await Promise.race([this.syncPromise, timeoutPromise])
      devLog('✅ Sync completed, proceeding')
      return true
    } catch (error) {
      devWarn('⚠️ Sync wait timed out or failed:', error.message)
      return false
    }
  }

  /**
   * Set the current user ID for tracking
   * @param {string} userId - Current authenticated user ID
   */
  setUserId(userId) {
    if (this.currentUserId !== userId) {
      this.currentUserId = userId
      this.localCache = null // Clear cache when user changes
      this.poolUpdatedInSession = false // Allow pool update for new user
      this.poolUpdateInProgress = false
      // Reset sync state for new user
      this.syncPromise = null
      this.syncResolve = null
      this.syncComplete = false
      this.syncInProgress = false
      this.loadingPromise = null
    }
  }

  /**
   * Reset the session flag to allow pool update on new game
   * Call this when starting a new game to check for new questions
   */
  resetSessionFlag() {
    this.poolUpdatedInSession = false
    this.poolUpdateInProgress = false
    this.localCache = null // Clear cache to force fresh read from Firebase
    devLog('🔄 Question pool session flag and cache reset for new game')
  }

  /**
   * Clear the local cache to force a fresh read from Firebase
   * Call this when returning to CategorySelection to get updated counts
   */
  clearCache() {
    this.localCache = null
    devLog('🧹 Question usage cache cleared')
  }

  /**
   * Get the usage data from Firestore for the current user
   * @returns {Promise<Object>} Usage data with questionId -> usage count
   */
  async getUsageData() {
    if (!this.currentUserId) {
      devWarn('⚠️ No user ID set, falling back to localStorage')
      return this.getLocalUsageData()
    }

    // Return cached data if available
    if (this.localCache) {
      return this.localCache
    }

    // Prevent concurrent loads - if already loading, wait for it
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    this.loadingPromise = this._loadUsageDataFromFirestore()

    try {
      const result = await this.loadingPromise
      return result
    } finally {
      this.loadingPromise = null
    }
  }

  /**
   * Internal method to load usage data from Firestore
   * Should only be called from getUsageData()
   */
  async _loadUsageDataFromFirestore() {
    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      const docSnap = await getDoc(userDoc)

      if (docSnap.exists()) {
        const data = docSnap.data()
        this.localCache = data.usageData || {}
        devLog(`📱 Loaded question usage from Firestore (${Object.keys(this.localCache).length} entries)`)
        return this.localCache
      } else {
        // Document doesn't exist - DON'T create it here, just return empty
        // The document will be created when we first save data
        this.localCache = {}
        devLog('📭 No usage document found, starting fresh')
        return this.localCache
      }
    } catch (error) {
      prodError('❌ Error loading question usage from Firestore:', error)
      return this.getLocalUsageData()
    }
  }

  /**
   * Fallback method to get usage data from localStorage
   * @returns {Object} Usage data from localStorage
   */
  getLocalUsageData() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      prodError('❌ Error loading question usage data from localStorage:', error)
      return {}
    }
  }

  /**
   * Save usage data to Firestore for the current user (throttled)
   * @param {Object} usageData - Usage data to save
   * @param {boolean} immediate - Force immediate save (bypass throttling)
   */
  async saveUsageData(usageData, immediate = false) {
    if (!this.currentUserId) {
      devWarn('⚠️ No user ID set, falling back to localStorage')
      return this.saveLocalUsageData(usageData)
    }

    // Update local cache immediately
    this.localCache = usageData

    if (immediate) {
      return this.performFirestoreWrite(usageData)
    }

    // Use throttled save for regular updates
    return this.scheduleThrottledSave(usageData)
  }

  /**
   * Schedule a throttled save to prevent rapid Firebase writes
   * @param {Object} usageData - Usage data to save
   */
  scheduleThrottledSave(usageData) {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    const now = Date.now()
    const timeSinceLastWrite = now - this.lastWriteTime
    const delay = Math.max(0, this.WRITE_THROTTLE_MS - timeSinceLastWrite)

    devLog(`⏱️ Scheduling Firebase write in ${delay}ms`)

    this.saveTimeout = setTimeout(async () => {
      await this.performFirestoreWrite(usageData)
    }, delay)
  }

  /**
   * Perform actual Firestore write
   * @param {Object} usageData - Usage data to save
   */
  async performFirestoreWrite(usageData) {
    if (!this.currentUserId) {
      return
    }

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      const poolSize = await this.getPoolSize()

      // Use setDoc with merge to create document if it doesn't exist
      await setDoc(userDoc, {
        usageData: usageData,
        poolSize: poolSize,
        lastUpdated: Date.now()
      }, { merge: true })

      this.lastWriteTime = Date.now()
      const usedCount = Object.values(usageData).filter(v => v > 0).length
      devLog(`💾 Saved question usage to Firestore (${usedCount} used / ${Object.keys(usageData).length} total)`)
    } catch (error) {
      prodError('❌ Error saving question usage to Firestore:', error)
      // Fallback to localStorage
      this.saveLocalUsageData(usageData)
    }
  }

  /**
   * Fallback method to save usage data to localStorage
   * @param {Object} usageData - Usage data to save
   */
  saveLocalUsageData(usageData) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(usageData))
      devLog('💾 Saved question usage data to localStorage')
    } catch (error) {
      prodError('❌ Error saving question usage data to localStorage:', error)
    }
  }

  /**
   * Get the current pool size from Firestore or localStorage
   * @returns {Promise<number>} Total number of questions in the pool
   */
  async getPoolSize() {
    if (!this.currentUserId) {
      return this.getLocalPoolSize()
    }

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      const docSnap = await getDoc(userDoc)

      if (docSnap.exists()) {
        const data = docSnap.data()
        const firestorePoolSize = data.poolSize || 0

        // If Firestore has no pool size, fallback to localStorage
        if (firestorePoolSize === 0) {
          return this.getLocalPoolSize()
        }

        return firestorePoolSize
      } else {
        // Firestore document doesn't exist yet, use localStorage
        return this.getLocalPoolSize()
      }
    } catch (error) {
      prodError('❌ Error loading pool size from Firestore:', error)
      return this.getLocalPoolSize()
    }
  }

  /**
   * Get pool size from localStorage (fallback)
   * @returns {number} Pool size from localStorage
   */
  getLocalPoolSize() {
    try {
      const size = localStorage.getItem(this.POOL_SIZE_KEY)
      return size ? parseInt(size, 10) : 0
    } catch (error) {
      prodError('❌ Error loading pool size from localStorage:', error)
      return 0
    }
  }

  /**
   * Save the current pool size to localStorage and Firestore
   * @param {number} size - Total number of questions in the pool
   */
  async savePoolSize(size) {
    try {
      // Save to localStorage for quick access
      localStorage.setItem(this.POOL_SIZE_KEY, size.toString())
      devLog('💾 Saved question pool size to localStorage:', size)

      // Also save to Firestore if user is authenticated
      if (this.currentUserId) {
        const userDoc = doc(db, 'questionUsage', this.currentUserId)
        await updateDoc(userDoc, {
          poolSize: size,
          lastUpdated: Date.now()
        }).catch(async (error) => {
          // If document doesn't exist, create it with merge to preserve any other fields
          if (error.code === 'not-found') {
            await setDoc(userDoc, {
              poolSize: size,
              lastUpdated: Date.now()
            }, { merge: true })
          } else {
            throw error
          }
        })
        devLog('💾 Saved question pool size to Firestore:', size)
      }
    } catch (error) {
      prodError('❌ Error saving pool size:', error)
    }
  }

  /**
   * Update the question pool with current game data
   * Supports both full questions mode and lazy loading mode (questionIds only)
   * @param {Object} gameData - Game data with questions and/or categories with questionIds
   */
  async updateQuestionPool(gameData) {
    if (!gameData) return

    // Skip if already updated in this session or currently updating
    if (this.poolUpdatedInSession) {
      devLog('⏭️ Question pool already updated in this session, skipping')
      return
    }

    if (this.poolUpdateInProgress) {
      devLog('⏳ Question pool update already in progress, skipping')
      return
    }

    this.poolUpdateInProgress = true

    try {
      // Check if we have full questions or just questionIds (lazy loading)
      const hasFullQuestions = gameData.questions && Object.keys(gameData.questions).length > 0
      const hasQuestionIds = gameData.categories?.some(c => c.questionIds?.length > 0)

      if (!hasFullQuestions && !hasQuestionIds) {
        devLog('⚠️ No questions or questionIds available, skipping pool update')
        return
      }

      let currentPoolSize = 0

      if (hasFullQuestions) {
        // Full questions mode - count from questions object
        const totalQuestions = Object.values(gameData.questions).flat()
        currentPoolSize = totalQuestions.length

        devLog(`📊 Current question pool size (full mode): ${currentPoolSize}`)
        await this.savePoolSize(currentPoolSize)

        // Initialize usage tracking for new questions
        const usageData = await this.getUsageData()
        let newQuestionsCount = 0

        Object.entries(gameData.questions).forEach(([categoryId, questions]) => {
          questions.forEach(question => {
            const questionId = this.getQuestionId(question, categoryId)
            if (!usageData[questionId]) {
              usageData[questionId] = 0
              newQuestionsCount++
            }
          })
        })

        if (newQuestionsCount > 0) {
          devLog(`✨ Added ${newQuestionsCount} new questions to tracking`)
          await this.saveUsageData(usageData)
        }
      } else if (hasQuestionIds) {
        // Lazy loading mode - count from questionIds arrays
        currentPoolSize = gameData.categories.reduce((total, cat) => {
          return total + (cat.questionIds?.length || 0)
        }, 0)

        devLog(`📊 Current question pool size (lazy mode): ${currentPoolSize}`)
        await this.savePoolSize(currentPoolSize)

        // In lazy mode, we don't add new tracking entries here
        // They will be added when questions are actually loaded for a game
      }

      this.poolUpdatedInSession = true
    } finally {
      this.poolUpdateInProgress = false
    }
  }

  /**
   * Generate a unique ID for a question based on its content
   * @param {Object} question - Question object
   * @param {string} categoryId - Optional category ID (preferred over question.category for consistency)
   * @returns {string} Unique question ID
   */
  getQuestionId(question, categoryId = null) {
    // Use provided categoryId, or fall back to question's category
    const category = categoryId || String(question.category || question.categoryId || '')

    // PREFERRED: Use Firebase document ID if available (most unique)
    if (question.id && typeof question.id === 'string' && question.id.length > 5) {
      return `${category}-${question.id}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
    }

    // FALLBACK: Use text + answer combination with MORE characters to avoid collisions
    // Many riddle questions start with same text, so we need the FULL text + answer
    const text = String(question.text || question.question?.text || '')
    const answer = String(question.answer || question.question?.answer || '')

    // Use full text (up to 100 chars) + full answer (up to 50 chars) for better uniqueness
    const textPart = text.substring(0, 100)
    const answerPart = answer.substring(0, 50)

    return `${category}-${textPart}-${answerPart}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
  }

  /**
   * Mark a question as used for the current user (optimized with throttling)
   * @param {Object} question - Question object that was used
   * @param {string} categoryId - Optional category ID to use for consistent tracking
   */
  async markQuestionAsUsed(question, categoryId = null) {
    const questionId = this.getQuestionId(question, categoryId)
    const usageData = await this.getUsageData()

    // Only mark if not already marked (questions are pre-marked at game creation)
    if (usageData[questionId] && usageData[questionId] > 0) {
      devLog(`⏭️ Question already marked, skipping: ${questionId}`)
      return Promise.resolve()
    }

    usageData[questionId] = 1  // Set to 1, don't increment

    devLog(`📝 Marked question as used: ${questionId}`)

    // Update local cache immediately for instant UI response
    this.localCache = usageData

    // Use throttled save to prevent Firebase write exhaustion
    this.saveUsageData(usageData, false) // false = use throttling

    // Check reset in background with additional throttling
    setTimeout(() => {
      this.checkAndResetIfAllUsed().catch(error => {
        prodError('Background reset check failed:', error)
      })
    }, 5000) // Delay reset check by 5 seconds

    // Return immediately for instant UI response
    return Promise.resolve()
  }

  /**
   * Check if all questions in the pool have been used at least once
   * If so, reset all usage counts to allow questions to be used again
   *
   * SAFEGUARDS added to prevent accidental resets:
   * 1. Pool size must be at least 50 questions (reasonable minimum)
   * 2. Tracked questions must match pool size (within 10%)
   * 3. ALL questions must be used (100%, not just >=)
   */
  async checkAndResetIfAllUsed() {
    const usageData = await this.getUsageData()
    const poolSize = await this.getPoolSize()

    // Safeguard 1: Pool must have reasonable size
    if (poolSize < 50) {
      devLog(`⚠️ Pool size too small (${poolSize}), skipping auto-reset check`)
      return
    }

    const trackedQuestions = Object.keys(usageData).length
    const usedQuestions = Object.values(usageData).filter(count => count > 0).length

    devLog(`📊 Usage Statistics: ${usedQuestions}/${poolSize} questions used (${trackedQuestions} tracked)`)

    // Safeguard 2: Tracked questions should roughly match pool size
    // This prevents reset if tracking data is incomplete
    const trackingRatio = trackedQuestions / poolSize
    if (trackingRatio < 0.9) {
      devLog(`⚠️ Tracking incomplete (${(trackingRatio * 100).toFixed(1)}% coverage), skipping auto-reset`)
      return
    }

    // Safeguard 3: Only reset if truly ALL questions are used
    // (not >= which could trigger on small discrepancies)
    const allQuestionsUsed = usedQuestions >= poolSize && usedQuestions >= trackedQuestions

    if (allQuestionsUsed) {
      devLog('🔄 ALL QUESTIONS USED! Resetting usage cycle to allow reuse...')
      devLog(`📊 Reset triggered: used=${usedQuestions}, pool=${poolSize}, tracked=${trackedQuestions}`)

      // Reset all usage counts to 0
      const resetData = {}
      Object.keys(usageData).forEach(questionId => {
        resetData[questionId] = 0
      })

      // Use immediate save for reset (important operation)
      await this.saveUsageData(resetData, true)

      // Show notification to user
      this.showResetNotification()
    }
  }

  /**
   * Show notification that question pool has been reset
   */
  showResetNotification() {
    // You can customize this notification method
    devLog('🎉 Question pool reset! All questions are now available again.')

    // Optional: Show a toast notification or modal
    if (typeof window !== 'undefined' && window.alert) {
      setTimeout(() => {
        alert('🎉 تم استنفاد جميع الأسئلة! الآن يمكن إعادة استخدام جميع الأسئلة مرة أخرى.')
      }, 1000)
    }
  }

  /**
   * Filter available questions based on user usage
   * @param {Array} questions - Array of questions to filter
   * @param {string} difficulty - Optional difficulty filter
   * @param {string} categoryId - Optional category ID for consistent tracking
   * @returns {Promise<Array>} Array of available (unused) questions
   */
  async getAvailableQuestions(questions, difficulty = null, categoryId = null) {
    if (!questions || questions.length === 0) return []

    const usageData = await this.getUsageData()

    // Filter by difficulty if specified
    let filteredQuestions = questions
    if (difficulty) {
      filteredQuestions = questions.filter(q => q.difficulty === difficulty)
    }

    // Filter out used questions
    const availableQuestions = filteredQuestions.filter(question => {
      const questionId = this.getQuestionId(question, categoryId)
      const usageCount = usageData[questionId] || 0
      return usageCount === 0
    })

    devLog(`🎯 Available ${difficulty || 'all'} questions: ${availableQuestions.length}/${filteredQuestions.length}`)

    return availableQuestions
  }

  /**
   * Get usage statistics for the current user
   * @returns {Promise<Object>} Statistics about question usage
   */
  async getUsageStatistics() {
    const usageData = await this.getUsageData()
    const poolSize = await this.getPoolSize()

    const totalTracked = Object.keys(usageData).length
    const usedQuestions = Object.values(usageData).filter(count => count > 0).length
    // Fix: unusedQuestions should be poolSize - usedQuestions, not totalTracked - usedQuestions
    const unusedQuestions = poolSize - usedQuestions
    const completionPercentage = poolSize > 0 ? parseFloat((usedQuestions / poolSize * 100).toFixed(1)) : 0

    return {
      poolSize,
      totalTracked,
      usedQuestions,
      unusedQuestions,
      completionPercentage,
      cycleComplete: usedQuestions >= poolSize && poolSize > 0,
      usageData
    }
  }

  /**
   * Reset usage data for a specific category only
   * @param {string} categoryId - Category ID to reset
   * @param {Array} categoryQuestions - Questions in this category
   * @returns {Promise<void>}
   */
  async resetCategoryUsage(categoryId, categoryQuestions) {
    if (!categoryQuestions || categoryQuestions.length === 0) {
      devWarn('⚠️ No questions provided for category reset')
      return
    }

    devLog(`🔄 Resetting usage for category: ${categoryId}`)

    const usageData = await this.getUsageData()
    let resetCount = 0

    // Reset only the questions from this category
    categoryQuestions.forEach(question => {
      const questionId = this.getQuestionId(question, categoryId)
      if (usageData[questionId] !== undefined && usageData[questionId] > 0) {
        usageData[questionId] = 0
        resetCount++
      }
    })

    // Update local cache immediately
    this.localCache = usageData
    // Save to Firebase immediately (important operation)
    await this.saveUsageData(usageData, true)

    // Save category reset time to prevent sync from re-marking old games for this category
    await this.saveCategoryResetTime(categoryId, Date.now())

    if (resetCount > 0) {
      devLog(`✅ Reset ${resetCount} questions for category: ${categoryId}`)
    } else {
      devLog(`ℹ️ No used questions found for category: ${categoryId}`)
    }
  }

  /**
   * Reset a category using tracking IDs with atomic Firestore updates
   * This method is safer than resetCategoryUsage as it uses Firestore's field updates
   * to prevent race conditions with concurrent syncs
   * @param {string} categoryId - Category ID to reset
   * @param {Array<string>} trackingIds - Array of tracking IDs to reset
   * @returns {Promise<number>} Number of questions reset
   */
  async resetCategoryByTrackingIds(categoryId, trackingIds) {
    if (!this.currentUserId) {
      devWarn('⚠️ Cannot reset category: No user ID set')
      return 0
    }

    if (!trackingIds || trackingIds.length === 0) {
      devWarn('⚠️ No tracking IDs provided for category reset')
      return 0
    }

    devLog(`🔄 Atomic reset for category ${categoryId} (${trackingIds.length} questions)`)

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)

      // First, load current data to preserve other entries
      const docSnap = await getDoc(userDoc)
      let currentUsageData = {}
      let currentResetTimes = {}

      if (docSnap.exists()) {
        const data = docSnap.data()
        currentUsageData = data.usageData || {}
        currentResetTimes = data.categoryResetTimes || {}
        devLog(`📱 Loaded existing data: ${Object.keys(currentUsageData).length} entries, ${Object.keys(currentResetTimes).length} reset times`)
      }

      // Update only the specific tracking IDs
      let resetCount = 0
      trackingIds.forEach(trackingId => {
        if (currentUsageData[trackingId] !== undefined && currentUsageData[trackingId] > 0) {
          resetCount++
        }
        currentUsageData[trackingId] = 0
      })

      // Add the category reset time
      currentResetTimes[categoryId] = Date.now()

      // Save everything back with proper structure
      await setDoc(userDoc, {
        usageData: currentUsageData,
        categoryResetTimes: currentResetTimes,
        lastUpdated: Date.now()
      }, { merge: true })

      // Update local cache
      this.localCache = currentUsageData

      devLog(`✅ Atomic reset complete for category ${categoryId}: ${resetCount} used questions reset, timestamp saved`)
      return trackingIds.length
    } catch (error) {
      prodError('❌ Error in atomic category reset:', error)
      return 0
    }
  }

  /**
   * Clear all usage data for current user (reset questions)
   */
  async clearAllUsageData() {
    if (!this.currentUserId) {
      devWarn('⚠️ No user ID set, clearing localStorage')
      localStorage.removeItem(this.STORAGE_KEY)
      localStorage.removeItem(this.POOL_SIZE_KEY)
      devLog('🗑️ Cleared question usage data from localStorage')
      return
    }

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      const poolSize = await this.getPoolSize()

      await updateDoc(userDoc, {
        usageData: {},
        poolSize: poolSize,
        lastUpdated: Date.now()
      })

      // Clear local cache
      this.localCache = {}
      devLog('🗑️ Reset all question usage data in Firestore')
    } catch (error) {
      prodError('❌ Error clearing usage data from Firestore:', error)
      // Fallback to localStorage
      localStorage.removeItem(this.STORAGE_KEY)
      localStorage.removeItem(this.POOL_SIZE_KEY)
      devLog('🗑️ Cleared question usage data from localStorage (fallback)')
    }
  }

  /**
   * Export usage data for backup
   * @returns {Object} Complete usage data
   */
  exportUsageData() {
    return {
      usageData: this.getUsageData(),
      poolSize: this.getPoolSize(),
      timestamp: Date.now()
    }
  }

  /**
   * Import usage data from backup
   * @param {Object} backupData - Backup data to import
   */
  importUsageData(backupData) {
    if (backupData.usageData) {
      this.saveUsageData(backupData.usageData)
    }
    if (backupData.poolSize) {
      this.savePoolSize(backupData.poolSize)
    }
    devLog('📥 Imported question usage data from backup')
  }

  /**
   * Mark specific pre-assigned questions as used (for game creation)
   * This is called when a user pays for and creates a game - only the
   * pre-assigned questions for this specific game are marked as used
   * @param {Object} preAssignedQuestions - Object with buttonKey -> {trackingId, ...} mapping
   * @returns {Promise<number>} Number of questions marked as used
   */
  async markGameQuestionsAsUsed(preAssignedQuestions) {
    if (!preAssignedQuestions || Object.keys(preAssignedQuestions).length === 0) {
      devWarn('⚠️ No pre-assigned questions provided for marking')
      return 0
    }

    const usageData = await this.getUsageData()
    let markedCount = 0

    // Mark only the pre-assigned questions as used (using trackingId for consistency)
    Object.entries(preAssignedQuestions).forEach(([buttonKey, assignment]) => {
      const trackingId = assignment.trackingId
      if (trackingId && (!usageData[trackingId] || usageData[trackingId] === 0)) {
        usageData[trackingId] = 1
        markedCount++
      }
    })

    if (markedCount > 0) {
      // Update local cache immediately
      this.localCache = usageData
      // Save to Firebase immediately (important for paid games)
      await this.saveUsageData(usageData, true)
      devLog(`🎮 Marked ${markedCount} pre-assigned questions as used for new game`)
    }

    return markedCount
  }

  /**
   * Reset all question usage data for the current user
   * This allows users to reuse all questions again
   * Called from Profile page "Reset Questions" button
   * @returns {Promise<void>}
   */
  async resetAllQuestions() {
    devLog('🔄 Resetting all question usage data...')

    const usageData = await this.getUsageData()

    // Reset all usage counts to 0
    const resetData = {}
    Object.keys(usageData).forEach(questionId => {
      resetData[questionId] = 0
    })

    // Update local cache
    this.localCache = resetData

    // Save to Firebase immediately
    await this.saveUsageData(resetData, true)

    // Save lastResetTime to prevent sync from re-marking old games
    await this.saveLastResetTime(Date.now())

    devLog('✅ All question usage data has been reset')
    return true
  }

  /**
   * Save the last full reset timestamp to Firebase
   * @param {number} timestamp - Reset timestamp
   */
  async saveLastResetTime(timestamp) {
    if (!this.currentUserId) return

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      await updateDoc(userDoc, {
        lastResetTime: timestamp
      })
      devLog('💾 Saved lastResetTime:', new Date(timestamp).toISOString())
    } catch (error) {
      prodError('❌ Error saving lastResetTime:', error)
    }
  }

  /**
   * Save category-specific reset timestamp to Firebase
   * @param {string} categoryId - Category ID
   * @param {number} timestamp - Reset timestamp
   */
  async saveCategoryResetTime(categoryId, timestamp) {
    if (!this.currentUserId) {
      devWarn('⚠️ Cannot save category reset time: No user ID')
      return
    }

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)

      // Use setDoc with merge to handle both new and existing documents
      await setDoc(userDoc, {
        categoryResetTimes: {
          [categoryId]: timestamp
        }
      }, { merge: true })

      devLog(`💾 Saved reset time for category ${categoryId}:`, new Date(timestamp).toISOString())
    } catch (error) {
      prodError('❌ Error saving category reset time:', error)
    }
  }

  /**
   * Get reset timestamps from Firebase
   * @returns {Promise<{lastResetTime: number|null, categoryResetTimes: Object}>}
   */
  async getResetTimes() {
    if (!this.currentUserId) {
      return { lastResetTime: null, categoryResetTimes: {} }
    }

    try {
      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      const docSnap = await getDoc(userDoc)

      if (docSnap.exists()) {
        const data = docSnap.data()
        return {
          lastResetTime: data.lastResetTime || null,
          categoryResetTimes: data.categoryResetTimes || {}
        }
      }
    } catch (error) {
      prodError('❌ Error getting reset times:', error)
    }

    return { lastResetTime: null, categoryResetTimes: {} }
  }

  /**
   * Sync usage data from game history
   * This rebuilds the usage counters based on all user's played games
   * Called once per session on app load to ensure counters reflect actual game history
   * @param {Array} games - Array of all user games from Firebase
   * @param {Object} options - Sync options
   * @param {boolean} options.replaceMode - If true, replace all data instead of merging (use after game deletion)
   * @returns {Promise<{synced: number, categories: Object}>} Sync stats
   */
  async syncUsageFromGameHistory(games, options = {}) {
    const { replaceMode = false } = options
    if (!this.currentUserId) {
      devWarn('⚠️ Cannot sync: No user ID set')
      this.syncComplete = true // Mark as complete even on failure
      return { synced: 0, categories: {} }
    }

    // Check if already synced this session
    const syncKey = `usage_synced_${this.currentUserId}`
    if (sessionStorage.getItem(syncKey) === 'true') {
      // Verify that sync actually resulted in data - if not, force re-sync
      const existingData = await this.getUsageData()
      const usedCount = Object.values(existingData).filter(v => v > 0).length
      if (usedCount > 0) {
        devLog(`⏭️ Usage already synced this session (${usedCount} used), skipping`)
        this.syncComplete = true // Mark as complete
        return { synced: 0, categories: {} }
      } else {
        devLog('⚠️ Session flag set but no used questions found - forcing re-sync')
        sessionStorage.removeItem(syncKey) // Clear the flag to allow re-sync
      }
    }

    // Prevent concurrent sync operations
    if (this.syncInProgress) {
      devLog('⏳ Sync already in progress, waiting...')
      // Return the existing promise so callers can wait
      if (this.syncPromise) {
        return this.syncPromise
      }
      return { synced: 0, categories: {} }
    }
    this.syncInProgress = true

    // Create sync promise for other components to wait on
    this.syncPromise = new Promise(resolve => {
      this.syncResolve = resolve
    })

    devLog('🔄 Syncing usage data from game history...')

    try {
      if (!games || games.length === 0) {
        devLog('📭 No games found - keeping existing usage data')
        // No games found - DON'T clear existing data, just mark as synced
        // This prevents data loss if the query fails
        sessionStorage.setItem(syncKey, 'true')

        // Still resolve sync promise so waiting components can proceed
        const result = { synced: 0, categories: {} }
        this.syncComplete = true
        if (this.syncResolve) {
          this.syncResolve(result)
        }
        return result
      }

      // Get reset timestamps to filter out old games
      const { lastResetTime, categoryResetTimes } = await this.getResetTimes()
      const resetCategoryCount = Object.keys(categoryResetTimes).length
      devLog('📅 Reset times:', {
        lastResetTime: lastResetTime ? new Date(lastResetTime).toISOString() : 'none',
        categoryResetCount: resetCategoryCount,
        categoryResetTimes: resetCategoryCount > 0 ? categoryResetTimes : 'none'
      })

      // Collect all trackingIds from all games' assignedQuestions
      // Also fall back to usedQuestions for older games that don't have assignedQuestions
      const newUsageData = {}
      const categoryBreakdown = {}
      const skippedByCategory = {} // Track questions skipped due to category reset
      let gamesWithAssigned = 0
      let gamesWithUsed = 0
      let gamesSkippedByReset = 0

      games.forEach(game => {
        // Get game timestamp (createdAt or playedAt)
        const gameTime = game.createdAt?.toDate?.()?.getTime() ||
                         game.createdAt?.getTime?.() ||
                         (typeof game.createdAt === 'number' ? game.createdAt : null) ||
                         game.gameData?.playedAt ||
                         0

        // Skip entire game if it's older than full reset
        if (lastResetTime && gameTime < lastResetTime) {
          gamesSkippedByReset++
          devLog(`⏭️ Skipping game (older than full reset): ${game.id}`)
          return // Skip this game
        }

        const assignedQuestions = game.gameData?.assignedQuestions
        const usedQuestions = game.gameData?.usedQuestions

        // Try assignedQuestions first (preferred)
        if (assignedQuestions && Object.keys(assignedQuestions).length > 0) {
          gamesWithAssigned++
          Object.values(assignedQuestions).forEach(assignment => {
            const catId = assignment.categoryId || 'unknown'

            // Skip this question if its category was reset after this game
            const categoryResetTime = categoryResetTimes[catId]
            if (categoryResetTime && gameTime < categoryResetTime) {
              skippedByCategory[catId] = (skippedByCategory[catId] || 0) + 1
              return // Skip this question
            }

            // Try trackingId first, then generate from categoryId + questionId
            let trackingId = assignment.trackingId
            if (!trackingId && assignment.categoryId && assignment.questionId) {
              // Generate tracking ID from categoryId and questionId
              trackingId = `${assignment.categoryId}-${assignment.questionId}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
            }
            if (trackingId) {
              newUsageData[trackingId] = 1
              categoryBreakdown[catId] = (categoryBreakdown[catId] || 0) + 1
            }
          })
        }
        // Fall back to usedQuestions for older games (just button keys like "cat1-200")
        else if (usedQuestions) {
          gamesWithUsed++
          // usedQuestions can be an array or object
          const usedKeys = Array.isArray(usedQuestions)
            ? usedQuestions
            : Object.keys(usedQuestions)

          usedKeys.forEach(key => {
            // usedQuestions are button keys like "categoryId-points"
            // We'll use them as-is since we don't have trackingId
            if (key && typeof key === 'string') {
              // Try to extract category from key (format: categoryId-points)
              const catId = key.split('-')[0] || 'unknown'

              // Skip this question if its category was reset after this game
              const categoryResetTime = categoryResetTimes[catId]
              if (categoryResetTime && gameTime < categoryResetTime) {
                skippedByCategory[catId] = (skippedByCategory[catId] || 0) + 1
                return // Skip this question
              }

              newUsageData[key] = 1
              categoryBreakdown[catId] = (categoryBreakdown[catId] || 0) + 1
            }
          })
        }
      })

      devLog(`📊 Sync stats: ${gamesWithAssigned} games with assigned, ${gamesWithUsed} with used fallback, ${gamesSkippedByReset} skipped by reset, ${Object.keys(newUsageData).length} unique questions`)

      // Log skipped questions by category reset
      const totalSkipped = Object.values(skippedByCategory).reduce((a, b) => a + b, 0)
      if (totalSkipped > 0) {
        devLog(`🔄 Skipped ${totalSkipped} questions due to category resets:`, skippedByCategory)
      }

      // Debug: Show sample of tracking IDs if we have any
      const sampleIds = Object.keys(newUsageData).slice(0, 3)
      if (sampleIds.length > 0) {
        devLog(`📝 Sample tracking IDs from sync:`, sampleIds)
      }

      // Debug: If no tracking IDs found, log first game's data structure
      if (Object.keys(newUsageData).length === 0 && games.length > 0) {
        const firstGame = games[0]
        devLog('🔍 DEBUG - First game structure:', {
          hasAssignedQuestions: !!firstGame.gameData?.assignedQuestions,
          assignedQuestionsCount: Object.keys(firstGame.gameData?.assignedQuestions || {}).length,
          hasUsedQuestions: !!firstGame.gameData?.usedQuestions,
          sampleAssignment: firstGame.gameData?.assignedQuestions ? Object.values(firstGame.gameData.assignedQuestions)[0] : null
        })
      }

      // Handle based on mode
      if (replaceMode) {
        // REPLACE MODE: Used after game deletion to rebuild from remaining games
        devLog('🔄 Replace mode: Rebuilding usage data from remaining games')

        // Keep the structure (question IDs) but update usage counts
        const existingData = await this.getUsageData()
        const rebuiltData = {}

        // Reset all existing entries to 0, then set used ones to 1
        Object.keys(existingData).forEach(key => {
          rebuiltData[key] = 0
        })
        Object.keys(newUsageData).forEach(key => {
          rebuiltData[key] = 1
        })

        this.localCache = rebuiltData
        await this.saveUsageData(rebuiltData, true)
        devLog(`✅ Rebuilt usage data: ${Object.keys(newUsageData).length} questions marked as used`)
      } else {
        // MERGE MODE: Used on app load to prevent data loss
        // This prevents data loss if game history is incomplete
        if (Object.keys(newUsageData).length > 0) {
          const existingData = await this.getUsageData()
          const existingUsedCount = Object.values(existingData).filter(v => v > 0).length
          const newUsedCount = Object.keys(newUsageData).length

          // Merge: keep existing entries, add new ones from game history
          const mergedData = { ...existingData }
          let addedCount = 0
          Object.entries(newUsageData).forEach(([key, value]) => {
            if (!mergedData[key] || mergedData[key] === 0) {
              mergedData[key] = value
              addedCount++
            }
          })

          // Only save if we actually have changes to add
          if (addedCount > 0) {
            this.localCache = mergedData
            await this.saveUsageData(mergedData, true)
            devLog(`✅ Merged ${addedCount} new entries from game history (existing: ${existingUsedCount}, from history: ${newUsedCount})`)
          } else {
            devLog(`ℹ️ No new entries to add - existing data (${existingUsedCount} used) is up to date`)
          }
        } else {
          devLog('⚠️ No questions found in game history - keeping existing data')
        }
      }

      // Mark as synced for this session
      sessionStorage.setItem(syncKey, 'true')

      const result = {
        synced: Object.keys(newUsageData).length,
        categories: categoryBreakdown
      }

      // Resolve the sync promise so waiting components can proceed
      this.syncComplete = true
      if (this.syncResolve) {
        this.syncResolve(result)
      }

      return result
    } catch (error) {
      prodError('❌ Error in syncUsageFromGameHistory:', error)
      // Still mark as complete on error so components don't wait forever
      this.syncComplete = true
      if (this.syncResolve) {
        this.syncResolve({ synced: 0, categories: {} })
      }
      throw error
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Force a fresh sync on next app load
   * Call this when a game is deleted to ensure counters update
   */
  invalidateSyncCache() {
    if (this.currentUserId) {
      const syncKey = `usage_synced_${this.currentUserId}`
      sessionStorage.removeItem(syncKey)
      devLog('🔄 Sync cache invalidated, will re-sync on next load')
    }
  }

  /**
   * Force rebuild usage data from game history
   * This bypasses session checks and completely rebuilds usageData
   * Use this after backfill migration to ensure tracking IDs match
   * @param {Array} games - Array of all user games from Firebase
   * @returns {Promise<{synced: number, categories: Object}>} Rebuild stats
   */
  async forceRebuildUsageData(games) {
    if (!this.currentUserId) {
      devWarn('⚠️ Cannot rebuild: No user ID set')
      return { synced: 0, categories: {} }
    }

    devLog('🔄 Force rebuilding usage data from game history...')

    try {
      if (!games || games.length === 0) {
        devLog('📭 No games found - clearing usage data')
        this.localCache = {}
        await this.saveUsageData({}, true)
        return { synced: 0, categories: {} }
      }

      // Get reset timestamps to filter out old games
      const { lastResetTime, categoryResetTimes } = await this.getResetTimes()

      // Collect all trackingIds from all games
      const newUsageData = {}
      const categoryBreakdown = {}
      let gamesWithAssigned = 0
      let gamesWithUsed = 0
      let gamesSkipped = 0

      games.forEach(game => {
        // Get game timestamp
        const gameTime = game.createdAt?.toDate?.()?.getTime() ||
                         game.createdAt?.getTime?.() ||
                         (typeof game.createdAt === 'number' ? game.createdAt : null) ||
                         game.gameData?.playedAt ||
                         0

        // Skip game if older than full reset
        if (lastResetTime && gameTime < lastResetTime) {
          gamesSkipped++
          return
        }

        const assignedQuestions = game.gameData?.assignedQuestions
        const usedQuestions = game.gameData?.usedQuestions

        // Prefer assignedQuestions (newer format with trackingId)
        if (assignedQuestions && Object.keys(assignedQuestions).length > 0) {
          gamesWithAssigned++
          Object.values(assignedQuestions).forEach(assignment => {
            const catId = assignment.categoryId || 'unknown'

            // Skip if category was reset after this game
            const categoryResetTime = categoryResetTimes[catId]
            if (categoryResetTime && gameTime < categoryResetTime) {
              return
            }

            // Use trackingId from assignment (preferred)
            // This is the exact ID stored when game was created
            let trackingId = assignment.trackingId

            // Fallback: generate from categoryId + questionId
            if (!trackingId && assignment.categoryId && assignment.questionId) {
              trackingId = `${assignment.categoryId}-${assignment.questionId}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
            }

            if (trackingId) {
              newUsageData[trackingId] = 1
              categoryBreakdown[catId] = (categoryBreakdown[catId] || 0) + 1
            }
          })
        }
        // Fallback to usedQuestions for older games
        else if (usedQuestions) {
          gamesWithUsed++
          const usedKeys = Array.isArray(usedQuestions)
            ? usedQuestions
            : Object.keys(usedQuestions)

          usedKeys.forEach(key => {
            if (key && typeof key === 'string') {
              const catId = key.split('-')[0] || 'unknown'

              // Skip if category was reset after this game
              const categoryResetTime = categoryResetTimes[catId]
              if (categoryResetTime && gameTime < categoryResetTime) {
                return
              }

              // Note: usedQuestions keys are button keys like "categoryId-points"
              // These don't match the new questionIds format, but we store them anyway
              // for older games that don't have assignedQuestions
              newUsageData[key] = 1
              categoryBreakdown[catId] = (categoryBreakdown[catId] || 0) + 1
            }
          })
        }
      })

      devLog(`📊 Rebuild stats: ${gamesWithAssigned} games with assignedQuestions, ${gamesWithUsed} with usedQuestions, ${gamesSkipped} skipped`)
      devLog(`📊 Total: ${Object.keys(newUsageData).length} unique tracking IDs`)

      // Save the rebuilt data
      this.localCache = newUsageData
      await this.saveUsageData(newUsageData, true)

      // Clear session sync flag to allow normal sync next time
      const syncKey = `usage_synced_${this.currentUserId}`
      sessionStorage.setItem(syncKey, 'true')

      devLog(`✅ Usage data rebuilt: ${Object.keys(newUsageData).length} questions marked as used`)

      return {
        synced: Object.keys(newUsageData).length,
        categories: categoryBreakdown,
        gamesProcessed: gamesWithAssigned + gamesWithUsed,
        gamesWithAssigned,
        gamesWithUsed,
        gamesSkipped
      }
    } catch (error) {
      prodError('❌ Error rebuilding usage data:', error)
      throw error
    }
  }
}

// Create singleton instance
export const questionUsageTracker = new QuestionUsageTracker()
export default questionUsageTracker