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

    try {
      // Return cached data if available
      if (this.localCache) {
        return this.localCache
      }

      const userDoc = doc(db, 'questionUsage', this.currentUserId)
      const docSnap = await getDoc(userDoc)

      if (docSnap.exists()) {
        const data = docSnap.data()
        this.localCache = data.usageData || {}
        devLog('📱 Loaded question usage from Firestore')
        return this.localCache
      } else {
        // Create new document for user
        const initialData = { usageData: {}, poolSize: 0, lastUpdated: Date.now() }
        await setDoc(userDoc, initialData)
        this.localCache = {}
        devLog('✨ Created new question usage document for user')
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

      await updateDoc(userDoc, {
        usageData: usageData,
        poolSize: poolSize,
        lastUpdated: Date.now()
      })

      this.lastWriteTime = Date.now()
      devLog('💾 Saved question usage data to Firestore (throttled)')
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
          // If document doesn't exist, create it
          if (error.code === 'not-found') {
            await setDoc(userDoc, {
              usageData: {},
              poolSize: size,
              lastUpdated: Date.now()
            })
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
   * @param {Object} gameData - Game data with questions and categories
   */
  async updateQuestionPool(gameData) {
    if (!gameData || !gameData.questions) return

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
      const totalQuestions = Object.values(gameData.questions).flat()
      const currentPoolSize = totalQuestions.length

      devLog(`📊 Current question pool size: ${currentPoolSize}`)
      await this.savePoolSize(currentPoolSize)

      // Initialize usage tracking for new questions
      // IMPORTANT: Use categoryId from the key, not from question.category
      // This ensures consistent ID generation across all functions
      const usageData = await this.getUsageData()
      let newQuestionsCount = 0

      // Iterate by category to ensure we use the correct categoryId (the key)
      Object.entries(gameData.questions).forEach(([categoryId, questions]) => {
        questions.forEach(question => {
          // Use categoryId from key, not question.category (which might be the name)
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
   */
  async checkAndResetIfAllUsed() {
    const usageData = await this.getUsageData()
    const poolSize = await this.getPoolSize()

    if (poolSize === 0) return

    const usedQuestions = Object.values(usageData).filter(count => count > 0).length
    const allQuestionsUsed = usedQuestions >= poolSize

    devLog(`📊 Usage Statistics: ${usedQuestions}/${poolSize} questions used`)

    if (allQuestionsUsed) {
      devLog('🔄 ALL QUESTIONS USED! Resetting usage cycle to allow reuse...')

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

    if (resetCount > 0) {
      // Update local cache immediately
      this.localCache = usageData
      // Save to Firebase immediately (important operation)
      await this.saveUsageData(usageData, true)
      devLog(`✅ Reset ${resetCount} questions for category: ${categoryId}`)
    } else {
      devLog(`ℹ️ No used questions found for category: ${categoryId}`)
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

    devLog('✅ All question usage data has been reset')
    return true
  }

  /**
   * Sync usage data from game history
   * This rebuilds the usage counters based on all user's played games
   * Called once per session on app load to ensure counters reflect actual game history
   * @param {Array} games - Array of all user games from Firebase
   * @returns {Promise<{synced: number, categories: Object}>} Sync stats
   */
  async syncUsageFromGameHistory(games) {
    if (!this.currentUserId) {
      devWarn('⚠️ Cannot sync: No user ID set')
      return { synced: 0, categories: {} }
    }

    // Check if already synced this session
    const syncKey = `usage_synced_${this.currentUserId}`
    if (sessionStorage.getItem(syncKey) === 'true') {
      devLog('⏭️ Usage already synced this session, skipping')
      return { synced: 0, categories: {} }
    }

    // Prevent concurrent sync operations
    if (this.syncInProgress) {
      devLog('⏳ Sync already in progress, skipping')
      return { synced: 0, categories: {} }
    }
    this.syncInProgress = true

    devLog('🔄 Syncing usage data from game history...')

    try {
      if (!games || games.length === 0) {
        devLog('📭 No games found - keeping existing usage data')
        // No games found - DON'T clear existing data, just mark as synced
        // This prevents data loss if the query fails
        sessionStorage.setItem(syncKey, 'true')
        return { synced: 0, categories: {} }
      }

      // Collect all trackingIds from all games' assignedQuestions
      // Also fall back to usedQuestions for older games that don't have assignedQuestions
      const newUsageData = {}
      const categoryBreakdown = {}
      let gamesWithAssigned = 0
      let gamesWithUsed = 0

      games.forEach(game => {
        const assignedQuestions = game.gameData?.assignedQuestions
        const usedQuestions = game.gameData?.usedQuestions

        // Try assignedQuestions first (preferred)
        if (assignedQuestions && Object.keys(assignedQuestions).length > 0) {
          gamesWithAssigned++
          Object.values(assignedQuestions).forEach(assignment => {
            // Try trackingId first, then generate from categoryId + questionId
            let trackingId = assignment.trackingId
            if (!trackingId && assignment.categoryId && assignment.questionId) {
              // Generate tracking ID from categoryId and questionId
              trackingId = `${assignment.categoryId}-${assignment.questionId}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
            }
            if (trackingId) {
              newUsageData[trackingId] = 1
              const catId = assignment.categoryId || 'unknown'
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
              newUsageData[key] = 1
              // Try to extract category from key (format: categoryId-points)
              const catId = key.split('-')[0] || 'unknown'
              categoryBreakdown[catId] = (categoryBreakdown[catId] || 0) + 1
            }
          })
        }
      })

      devLog(`📊 Sync stats: ${gamesWithAssigned} games with assigned, ${gamesWithUsed} with used fallback, ${Object.keys(newUsageData).length} unique questions`)

      // Only update if we found some data
      if (Object.keys(newUsageData).length > 0) {
        this.localCache = newUsageData
        await this.saveUsageData(newUsageData, true)
        devLog(`✅ Synced ${Object.keys(newUsageData).length} questions from ${games.length} games`)
      } else {
        devLog('⚠️ No questions found in game history - keeping existing data')
      }

      // Mark as synced for this session
      sessionStorage.setItem(syncKey, 'true')

      return {
        synced: Object.keys(newUsageData).length,
        categories: categoryBreakdown
      }
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
}

// Create singleton instance
export const questionUsageTracker = new QuestionUsageTracker()
export default questionUsageTracker