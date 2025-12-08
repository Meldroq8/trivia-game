/**
 * Category Stats Service
 *
 * Pre-calculated stats for category analytics.
 * Updates stats incrementally when games start/finish.
 * Stores time-bucketed documents for fast filtered queries.
 */

import { db } from '../firebase/config'
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore'
import { devLog, devWarn, prodError } from '../utils/devLog'

// Get week number from date
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

// Get time bucket keys for a given date
const getTimeBucketKeys = (date = new Date()) => {
  const dateKey = date.toISOString().split('T')[0] // "2025-12-07"
  const monthKey = dateKey.substring(0, 7) // "2025-12"
  const weekKey = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}` // "2025-W49"

  return {
    daily: dateKey,
    weekly: weekKey,
    monthly: monthKey,
    allTime: 'all-time'
  }
}

// Initialize empty stats structure for a category
const getEmptyCategoryStats = () => ({
  timesSelected: 0,
  questionsAnswered: 0,
  correctAnswers: 0,
  totalPoints: 0
})

// Initialize empty stats document structure
const getEmptyStatsDoc = () => ({
  totalGames: 0,
  gamesCompleted: 0,
  categories: {},
  lastUpdated: new Date().toISOString()
})

// Throttle tracking to prevent write exhaustion
let lastTrackTime = 0
const TRACK_THROTTLE_MS = 3000 // Minimum 3 seconds between tracking calls

/**
 * Update stats when a game STARTS
 * Called when player navigates from CategorySelection to GameBoard
 */
export const trackGameStart = async (selectedCategories, userId = null) => {
  if (!selectedCategories || selectedCategories.length === 0) {
    devWarn('No categories to track for game start')
    return
  }

  // Throttle to prevent write exhaustion
  const now = Date.now()
  if (now - lastTrackTime < TRACK_THROTTLE_MS) {
    devLog('📊 Skipping game start tracking (throttled)')
    return
  }
  lastTrackTime = now

  // Run in background without blocking
  setTimeout(async () => {
    try {
      const buckets = getTimeBucketKeys()
      devLog('📊 Tracking game start for categories:', selectedCategories)

      // Update buckets sequentially to reduce write pressure
      for (const bucketKey of Object.values(buckets)) {
        const docRef = doc(db, 'categoryStats', bucketKey)

        try {
          const docSnap = await getDoc(docRef)

          if (docSnap.exists()) {
            // Update existing document
            const updates = {
              totalGames: increment(1),
              lastUpdated: new Date().toISOString()
            }

            // Increment timesSelected for each category
            selectedCategories.forEach(categoryId => {
              updates[`categories.${categoryId}.timesSelected`] = increment(1)
            })

            await updateDoc(docRef, updates)
          } else {
            // Create new document
            const newDoc = getEmptyStatsDoc()
            newDoc.totalGames = 1

            selectedCategories.forEach(categoryId => {
              newDoc.categories[categoryId] = getEmptyCategoryStats()
              newDoc.categories[categoryId].timesSelected = 1
            })

            await setDoc(docRef, newDoc)
          }

          devLog(`✅ Updated stats bucket: ${bucketKey}`)
        } catch (error) {
          // Silently fail individual bucket updates
          devWarn(`Failed to update stats bucket ${bucketKey}:`, error.message)
        }

        // Small delay between bucket updates
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      devLog('✅ Game start tracked successfully')
    } catch (error) {
      // Silently fail - don't disrupt the game
      devWarn('Error tracking game start:', error.message)
    }
  }, 100)
}

/**
 * Update stats when a game FINISHES
 * Called when player reaches Results page
 */
export const trackGameFinish = async (gameState) => {
  if (!gameState || !gameState.selectedCategories) {
    devWarn('No game state to track for game finish')
    return
  }

  // Run in background without blocking
  setTimeout(async () => {
    try {
      const buckets = getTimeBucketKeys()
      devLog('📊 Tracking game finish')

      // Calculate stats per category from gameHistory
      const categoryStats = {}
      const gameHistory = gameState.gameHistory || []

      gameHistory.forEach(entry => {
        const categoryId = entry.category || entry.categoryId
        if (!categoryId) return

        if (!categoryStats[categoryId]) {
          categoryStats[categoryId] = {
            questionsAnswered: 0,
            correctAnswers: 0,
            totalPoints: 0
          }
        }

        categoryStats[categoryId].questionsAnswered += 1

        // Check if question was answered correctly (has a winner that's not 'none')
        if (entry.winner && entry.winner !== 'none' && entry.winner !== '') {
          categoryStats[categoryId].correctAnswers += 1
        }

        categoryStats[categoryId].totalPoints += entry.points || 0
      })

      devLog('📊 Category stats calculated:', categoryStats)

      // Update buckets sequentially to reduce write pressure
      for (const bucketKey of Object.values(buckets)) {
        const docRef = doc(db, 'categoryStats', bucketKey)

        try {
          const docSnap = await getDoc(docRef)

          if (docSnap.exists()) {
            const updates = {
              gamesCompleted: increment(1),
              lastUpdated: new Date().toISOString()
            }

            // Update stats for each category
            Object.entries(categoryStats).forEach(([categoryId, stats]) => {
              updates[`categories.${categoryId}.questionsAnswered`] = increment(stats.questionsAnswered)
              updates[`categories.${categoryId}.correctAnswers`] = increment(stats.correctAnswers)
              updates[`categories.${categoryId}.totalPoints`] = increment(stats.totalPoints)
            })

            await updateDoc(docRef, updates)
          } else {
            // Create new document (shouldn't normally happen if trackGameStart was called)
            const newDoc = getEmptyStatsDoc()
            newDoc.gamesCompleted = 1

            Object.entries(categoryStats).forEach(([categoryId, stats]) => {
              newDoc.categories[categoryId] = {
                ...getEmptyCategoryStats(),
                ...stats
              }
            })

            await setDoc(docRef, newDoc)
          }

          devLog(`✅ Updated finish stats bucket: ${bucketKey}`)
        } catch (error) {
          // Silently fail individual bucket updates
          devWarn(`Failed to update finish stats bucket ${bucketKey}:`, error.message)
        }

        // Small delay between bucket updates
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      devLog('✅ Game finish tracked successfully')
    } catch (error) {
      // Silently fail - don't disrupt the results page
      devWarn('Error tracking game finish:', error.message)
    }
  }, 500)
}

/**
 * Get pre-calculated stats for a time period
 * @param {string} filter - 'today', 'week', 'month', or 'all'
 */
export const getCategoryStats = async (filter = 'all') => {
  try {
    const buckets = getTimeBucketKeys()
    let bucketKey

    switch (filter) {
      case 'today':
        bucketKey = buckets.daily
        break
      case 'week':
        bucketKey = buckets.weekly
        break
      case 'month':
        bucketKey = buckets.monthly
        break
      case 'all':
      default:
        bucketKey = buckets.allTime
        break
    }

    devLog(`📊 Fetching stats from bucket: ${bucketKey}`)

    const docRef = doc(db, 'categoryStats', bucketKey)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      devLog('📊 Stats fetched:', data)
      return data
    } else {
      devLog('📊 No stats found for bucket:', bucketKey)
      return getEmptyStatsDoc()
    }
  } catch (error) {
    prodError('Error fetching category stats:', error)
    return getEmptyStatsDoc()
  }
}

/**
 * Migration function to calculate stats from existing games
 * Run once to populate initial stats
 */
export const migrateExistingGames = async (getAllGames, adminUserIds = new Set()) => {
  try {
    devLog('🔄 Starting migration of existing games...')

    // Fetch all games
    const allGames = await getAllGames()
    devLog(`📊 Found ${allGames.length} games to migrate`)

    // Filter out admin games
    const userGames = allGames.filter(game => {
      const userId = game.userId || game.gameData?.userId
      return !adminUserIds.has(userId)
    })
    devLog(`📊 After filtering admins: ${userGames.length} user games`)

    // Group games by time buckets and calculate stats
    const statsByBucket = {}

    userGames.forEach(game => {
      const gameData = game.gameData
      if (!gameData) return

      const createdAt = game.createdAt instanceof Date
        ? game.createdAt
        : new Date(game.createdAt)

      const buckets = getTimeBucketKeys(createdAt)

      // Process each bucket
      Object.entries(buckets).forEach(([bucketType, bucketKey]) => {
        if (!statsByBucket[bucketKey]) {
          statsByBucket[bucketKey] = getEmptyStatsDoc()
        }

        const stats = statsByBucket[bucketKey]
        stats.totalGames += 1

        // Track selected categories
        const selectedCategories = gameData.selectedCategories || []
        selectedCategories.forEach(categoryId => {
          if (!stats.categories[categoryId]) {
            stats.categories[categoryId] = getEmptyCategoryStats()
          }
          stats.categories[categoryId].timesSelected += 1
        })

        // Track game history (questions answered)
        const gameHistory = gameData.gameHistory || []
        if (gameHistory.length > 0) {
          stats.gamesCompleted += 1
        }

        gameHistory.forEach(entry => {
          const categoryId = entry.category || entry.categoryId
          if (!categoryId) return

          if (!stats.categories[categoryId]) {
            stats.categories[categoryId] = getEmptyCategoryStats()
          }

          stats.categories[categoryId].questionsAnswered += 1

          if (entry.winner && entry.winner !== 'none' && entry.winner !== '') {
            stats.categories[categoryId].correctAnswers += 1
          }

          stats.categories[categoryId].totalPoints += entry.points || 0
        })
      })
    })

    // Write all stats documents
    devLog('📊 Writing stats to Firestore...')
    const writePromises = Object.entries(statsByBucket).map(async ([bucketKey, stats]) => {
      stats.lastUpdated = new Date().toISOString()
      stats.migratedAt = new Date().toISOString()

      const docRef = doc(db, 'categoryStats', bucketKey)
      await setDoc(docRef, stats)
      devLog(`✅ Wrote stats for bucket: ${bucketKey}`)
    })

    await Promise.all(writePromises)

    devLog('✅ Migration complete!')
    return {
      success: true,
      gamesProcessed: userGames.length,
      bucketsCreated: Object.keys(statsByBucket).length
    }
  } catch (error) {
    prodError('Error during migration:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

export default {
  trackGameStart,
  trackGameFinish,
  getCategoryStats,
  migrateExistingGames
}
