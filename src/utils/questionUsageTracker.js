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
  }

  /**
   * Set the current user ID for tracking
   * @param {string} userId - Current authenticated user ID
   */
  setUserId(userId) {
    if (this.currentUserId !== userId) {
      this.currentUserId = userId
      this.localCache = null // Clear cache when user changes
    }
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
    if (!this.currentUserId) return

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
   * Save the current pool size to localStorage
   * @param {number} size - Total number of questions in the pool
   */
  savePoolSize(size) {
    try {
      localStorage.setItem(this.POOL_SIZE_KEY, size.toString())
      devLog('💾 Saved question pool size:', size)
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

    const totalQuestions = Object.values(gameData.questions).flat()
    const currentPoolSize = totalQuestions.length

    devLog(`📊 Current question pool size: ${currentPoolSize}`)
    this.savePoolSize(currentPoolSize)

    // Initialize usage tracking for new questions
    const usageData = await this.getUsageData()
    let newQuestionsCount = 0

    totalQuestions.forEach(question => {
      const questionId = this.getQuestionId(question)
      if (!usageData[questionId]) {
        usageData[questionId] = 0
        newQuestionsCount++
      }
    })

    if (newQuestionsCount > 0) {
      devLog(`✨ Added ${newQuestionsCount} new questions to tracking`)
      await this.saveUsageData(usageData)
    }
  }

  /**
   * Generate a unique ID for a question based on its content
   * @param {Object} question - Question object
   * @returns {string} Unique question ID
   */
  getQuestionId(question) {
    // Use text + answer combination to create unique ID
    const text = String(question.text || question.question?.text || '')
    const answer = String(question.answer || question.question?.answer || '')
    const category = String(question.category || question.categoryId || '')
    return `${category}-${text.substring(0, 50)}-${answer.substring(0, 20)}`.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')
  }

  /**
   * Mark a question as used for the current user (optimized with throttling)
   * @param {Object} question - Question object that was used
   */
  async markQuestionAsUsed(question) {
    const questionId = this.getQuestionId(question)
    const usageData = await this.getUsageData()

    usageData[questionId] = (usageData[questionId] || 0) + 1

    devLog(`📝 Marked question as used: ${questionId} (usage count: ${usageData[questionId]})`)

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
   * @returns {Promise<Array>} Array of available (unused) questions
   */
  async getAvailableQuestions(questions, difficulty = null) {
    if (!questions || questions.length === 0) return []

    const usageData = await this.getUsageData()

    // Filter by difficulty if specified
    let filteredQuestions = questions
    if (difficulty) {
      filteredQuestions = questions.filter(q => q.difficulty === difficulty)
    }

    // Filter out used questions
    const availableQuestions = filteredQuestions.filter(question => {
      const questionId = this.getQuestionId(question)
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
    const unusedQuestions = totalTracked - usedQuestions
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
      const questionId = this.getQuestionId(question)
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
}

// Create singleton instance
export const questionUsageTracker = new QuestionUsageTracker()
export default questionUsageTracker